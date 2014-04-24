var fs = require('fs'),
    path = require('path'),
    os = require('os');

function ERROR_NOOP(err) {}

module.exports = middleware;

function middleware(formFields, options) {
  return function(req, res, next) {
    // if connect-busboy created a new Busboy instance, we should expect some
    // data ...
    if (req.busboy) {
      var form = req.form = new Form(formFields, options);

      form.parse(req.busboy, function(err) {
        if (err)
          form.error = err;
        next();
      });

      var pipes = req._readableState.pipes;
      if (pipes
          && (pipes === req.busboy
              || (Array.isArray(pipes) && pipes.indexOf(req.busboy) > -1))) {
        // connect-busboy was configured with `immediate: true` and thus
        // req is already piped to this busboy instance ...
        req.busboy.emit('pipe', req);
      } else
        req.pipe(req.busboy);
    } else
      next();
  };
}
middleware.Form = Form;

function Form(cfg, opts) {
  if (!(this instanceof Form))
    return new Form(cfg, opts);

  this.cfg = cfg;
  this.tmpdir = (opts && typeof opts.tmpdir === 'string'
                 ? opts.tmpdir
                 : os.tmpdir());
  this.data = undefined;
}
Form.prototype.parse = function(bb, cb) {
  var self = this,
      cfg = this.cfg,
      pipesrc,
      filesInProgress = [],
      data = {},
      f = 1,
      finished = false,
      rulesLeft = 0,
      hadError = false;

  this.data = {};

  bb.once('pipe', onBBPipe)
    .once('unpipe', onBBUnpipe)
    .on('error', onBBError)
    .on('finish', onBBFinish);

  var hasFile = false,
      hasField = false;
  for (var i = 0, keys = Object.keys(cfg), len = keys.length, v; i < len; ++i) {
    v = cfg[keys[i]];
    if (typeof v !== 'object')
      continue;
    var isFile = (v.filename !== undefined
                  || v.buffered !== undefined
                  || v.stream !== undefined);
    if (!isFile && !hasField) {
      bb.on('field', onBBField);
      hasField = true;
    } else if (isFile && !hasFile) {
      bb.on('file', onBBFile);
      hasFile = true;
    }
    if (hasField && hasFile)
      break;
  }

  function errorCleanup(key, err) {
    if (hadError) return;
    hadError = true;
    var i,
        len;

    // cleanup any files saved to disk
    var keys = Object.keys(data),
        k;
    for (i = 0, len = keys.length; i < len; ++i) {
      k = keys[i];
      if (data[k] && typeof data[k].filename === 'string' && data[k].length)
        fs.unlink(data[k].filename);
    }
    // cleanup any files in progress
    if (filesInProgress.length) {
      for (i = 0, len = filesInProgress.length; i < len; ++i) {
        var s = filesInProgress[i];
        s.unpipe(s.fileDisk)
         .removeAllListeners('error')
         .removeAllListeners('end');
        s.fileDisk.removeAllListeners('error')
                  .close(function() { fs.unlink(s.filename); });
      }
      filesInProgress = [];
    }

    data = undefined;

    if (pipesrc)
      pipesrc.unpipe(bb);

    bb.removeListener('field', onBBField)
      .removeListener('file', onBBFile)
      .removeListener('error', onBBError)
      .removeListener('finish', onBBFinish)
      .removeListener('pipe', onBBPipe)
      .removeListener('unpipe', onBBUnpipe);

    if (typeof err === 'string') {
      var error = new Error(err);
      error.key = key;
      cb(error);
    } else
      cb(err);
  }

  function onBBField(key, val) {
    var def = cfg[key];
    if (typeof def === 'object'
        && (def.filename === undefined && def.buffered === undefined)) {
      var multiple = def.multiple;

      if (!multiple && data[key] !== undefined) {
        if (def.strictNotMultiple === true)
          errorCleanup(key, new Error('Multiple values not allowed'));
        return;
      }

      if (typeof def.dataType === 'function' && def.dataType !== String)
        val = def.dataType(val);

      if (def.rules && def.rules.length) {
        var rules = def.rules,
            i = 0,
            len = rules.length;

        rulesLeft += len;

        function nextRule() {
          while (i < len) {
            var err,
                ret,
                r = rules[i];

            if (typeof r.test === 'function') {
              if (r.test.length >= 3) {
                r.test.call(data, key, val, function(err, passed) {
                  if (err instanceof Error || typeof err === 'string')
                    return errorCleanup(key, err);
                  else if (!passed)
                    return errorCleanup(key, r.error);
                  ++i;
                  if (i === len)
                    addValue();
                  if (--rulesLeft === 0)
                    maybeDone();
                  else if (i < len)
                    process.nextTick(nextRule);
                });
                return;
              } else {
                ret = r.test.call(data, key, val);
                if (ret === false)
                  err = r.error;
                else if (ret instanceof Error || typeof ret === 'string')
                  err = ret;
              }
            } else if (r.test instanceof RegExp && !r.test.test(val))
              err = r.error;

            if (err !== undefined)
              return errorCleanup(key, err);
            ++i;
            if (i === len)
              addValue();
            if (--rulesLeft === 0)
              maybeDone();
          }
        }
        nextRule();
        return;
      }
      addValue();
      maybeDone();

      function addValue() {
        if (multiple) {
          if (Array.isArray(data[key]))
            data[key].push(val);
          else if (data[key] !== undefined)
            data[key] = [data[key], val];
          else
            data[key] = [val];
        } else
          data[key] = val;
      }
    }
  }

  function onBBFile(key, stream) {
    var def = cfg[key];
    if (typeof def === 'object'
        && (def.filename !== undefined
            || def.buffered !== undefined
            || def.stream !== undefined)) {
      var multiple = def.multiple,
          filename = def.filename,
          buffered = def.buffered,
          streamcb = def.stream,
          filesize = 0,
          onData,
          onEnd,
          fileDisk,
          maxSize;

      if (!multiple && data[key] !== undefined) {
        if (def.strictNotMultiple === true)
          errorCleanup(key, new Error('Multiple values not allowed'));
        return stream.resume();
      }

      function onError(err) {
        var idx = filesInProgress.indexOf(stream);
        if (idx > -1)
          filesInProgress.splice(idx, 1);

        stream.removeListener('data', onData)
              .removeListener('error', onError);
        if (fileDisk) {
          stream.unpipe(fileDisk);
          fileDisk.removeListener('error', onError)
                  .removeListener('finish', onEnd)
                  .on('error', ERROR_NOOP)
                  .close(function() {
                    fs.unlink(filename);
                  });
          delete data[key];
        }
        errorCleanup(key, err);
      }

      if (typeof filename === 'string' || filename === true) {
        filesInProgress.push(stream);

        if (filename.length === 0 || filename === true) {
          filename = path.join(self.tmpdir,
                               'busboy-' + Date.now() + '.' + (f++) + '.tmp');
        }

        fileDisk = stream.fileDisk = fs.createWriteStream(filename);
        stream.filename = filename;

        if (def.rules)
          rulesLeft += def.rules.length;

        onEnd = function() {
          var idx = filesInProgress.indexOf(stream);
          if (idx > -1)
            filesInProgress.splice(idx, 1);

          if (def.rules && def.rules.length) {
            var rules = def.rules,
                i = 0,
                len = rules.length;

            function nextRule() {
              while (i < len) {
                var err,
                    ret,
                    r = rules[i];

                if (typeof r.test === 'function') {
                  if (r.test.length >= 4) {
                    r.test(key, filename, filesize, function(err, passed) {
                      if (err instanceof Error || typeof err === 'string')
                        return errorCleanup(key, err);
                      else if (!passed)
                        return errorCleanup(key, r.error);
                      ++i;
                      if (i === len)
                        addValue();
                      if (--rulesLeft === 0)
                        maybeDone();
                      else if (i < len)
                        process.nextTick(nextRule);
                    });
                    return;
                  } else {
                   ret = r.test(key, filename, filesize);
                   if (ret === false)
                     err = r.error;
                    else if (ret instanceof Error || typeof ret === 'string')
                     err = ret;
                  }
                } else if (r.test instanceof RegExp) {
                  var re = r.test,
                      readOpts = { encoding: 'binary' };
                  r.test = function(key, fname, size, cbb) {
                    fs.readFile(fname, readOpts, function(err, contents) {
                      if (err)
                        return errorCleanup(key, err);
                      cbb(re.test(contents));
                    });
                  };
                  continue;
                }

                if (err !== undefined)
                  return errorCleanup(key, err);
                ++i;
                if (i === len)
                  addValue();
                if (--rulesLeft === 0)
                  maybeDone();
              }
            }
            nextRule();
            return;
          }
          addValue();
          maybeDone();

          function addValue() {
            var info = { filename: filename, size: filesize };
            if (multiple) {
              if (Array.isArray(data[key]))
                data[key].push(info);
              else if (data[key] !== undefined)
                data[key] = [data[key], info];
              else
                data[key] = [info];
            } else
              data[key] = info;
          }
        };

        if (typeof def.maxSize === 'number'
            || (typeof def.maxSize === 'object'
                && typeof def.maxSize.size === 'number')) {
          maxSize = (typeof def.maxSize === 'number'
                     ? def.maxSize
                     : def.maxSize.size);
          onData = function(chunk) {
            filesize += chunk.length;
            if (filesize > maxSize) {
              var sizeErr;
              if (typeof def.maxSize === 'object'
                  && typeof def.maxSize.error === 'string')
                sizeErr = def.maxSize.error;
              else
                sizeErr = 'File exceeded maximum size limit';
              onError(sizeErr);
            }
          };
        } else {
          onData = function(chunk) {
            filesize += chunk.length;
          };
        }

        fileDisk.on('error', onError);
        stream.on('data', onData)
              .on('error', onError)
              .pipe(fileDisk)
              .on('finish', onEnd);
        return;
      } else if (buffered === true) {
        // buffer in memory instead of writing to disk

        filesInProgress.push(stream);

        var buffers = [];

        if (def.rules)
          rulesLeft += def.rules.length;

        onEnd = function() {
          var idx = filesInProgress.indexOf(stream),
              val = Buffer.concat(buffers, filesize);

          if (idx > -1)
            filesInProgress.splice(idx, 1);

          if (typeof def.dataType === 'function')
            val = def.dataType(val);
          else if (Buffer.isEncoding(def.encoding))
            val = val.toString(def.encoding);

          if (def.rules && def.rules.length) {
            var rules = def.rules,
                i = 0,
                len = rules.length;

            function nextRule() {
              while (i < len) {
                var err,
                    ret,
                    r = rules[i];

                if (typeof r.test === 'function') {
                  if (r.test.length >= 4) {
                    r.test(key, val, filesize, function(err, passed) {
                      if (err instanceof Error || typeof err === 'string')
                        return errorCleanup(key, err);
                      else if (passed === false)
                        return errorCleanup(key, r.error);
                      ++i;
                      if (i === len)
                        addValue();
                      if (--rulesLeft === 0)
                        maybeDone();
                      else if (i < len)
                        process.nextTick(nextRule);
                    });
                    return;
                  } else {
                    ret = r.test(key, val, filesize);
                    if (ret === false)
                      err = r.error;
                    else if (ret instanceof Error || typeof ret === 'string')
                      err = ret;
                  }
                } else if (r.test instanceof RegExp
                           && !r.test.test(val.toString('binary')))
                  err = r.error;

                if (err !== undefined)
                  return errorCleanup(key, err);
                ++i;
                if (i === len)
                  addValue();
                if (--rulesLeft === 0)
                  maybeDone();
              }
            }
            nextRule();
            return;
          }
          addValue();
          maybeDone();

          function addValue() {
            var info = { data: val, size: filesize };
            if (multiple) {
              if (Array.isArray(data[key]))
                data[key].push(info);
              else if (data[key] !== undefined)
                data[key] = [data[key], info];
              else
                data[key] = [info];
            } else
              data[key] = info;
          }
        };

        if (typeof def.maxSize === 'number'
            || (typeof def.maxSize === 'object'
                && typeof def.maxSize.size === 'number')) {
          maxSize = (typeof def.maxSize === 'number'
                     ? def.maxSize
                     : def.maxSize.size);
          onData = function(chunk) {
            buffers.push(chunk);
            filesize += chunk.length;
            if (filesize > maxSize) {
              var sizeErr;
              if (typeof def.maxSize === 'object'
                  && typeof def.maxSize.error === 'string')
                sizeErr = def.maxSize.error;
              else
                sizeErr = 'File exceeded maximum size limit';
              onError(sizeErr);
            }
          };
        } else {
          onData = function(chunk) {
            buffers.push(chunk);
            filesize += chunk.length;
          };
        }

        stream.on('data', onData)
              .on('error', onError)
              .on('end', onEnd);
        return;
      }  else if (typeof streamcb === 'function') {
        // stream file

        filesInProgress.push(stream);

        if (def.rules)
          rulesLeft += def.rules.length;

        onEnd = function() {
          var idx = filesInProgress.indexOf(stream);

          if (idx > -1)
            filesInProgress.splice(idx, 1);

          if (def.rules && def.rules.length) {
            var rules = def.rules,
                i = 0,
                len = rules.length;

            function nextRule() {
              while (i < len) {
                var err,
                    ret,
                    r = rules[i];

                if (typeof r.test === 'function') {
                  if (r.test.length >= 4) {
                    r.test(key, undefined, filesize, function(err, passed) {
                      if (err instanceof Error || typeof err === 'string')
                        return errorCleanup(key, err);
                      else if (passed === false)
                        return errorCleanup(key, r.error);
                      ++i;
                      if (i === len)
                        addValue();
                      if (--rulesLeft === 0)
                        maybeDone();
                      else if (i < len)
                        process.nextTick(nextRule);
                    });
                    return;
                  } else {
                    ret = r.test(key, undefined, filesize);
                    if (ret === false)
                      err = r.error;
                    else if (ret instanceof Error || typeof ret === 'string')
                      err = ret;
                  }
                }

                if (err !== undefined)
                  return errorCleanup(key, err);
                ++i;
                if (i === len)
                  addValue();
                if (--rulesLeft === 0)
                  maybeDone();
              }
            }
            nextRule();
            return;
          }
          addValue();
          maybeDone();

          function addValue() {
            var info = { size: filesize };
            if (multiple) {
              if (Array.isArray(data[key]))
                data[key].push(info);
              else if (data[key] !== undefined)
                data[key] = [data[key], info];
              else
                data[key] = [info];
            } else
              data[key] = info;
          }
        };

        if (typeof def.maxSize === 'number'
            || (typeof def.maxSize === 'object'
                && typeof def.maxSize.size === 'number')) {
          maxSize = (typeof def.maxSize === 'number'
                     ? def.maxSize
                     : def.maxSize.size);
          onData = function(chunk) {
            filesize += chunk.length;
            if (filesize > maxSize) {
              var sizeErr;
              if (typeof def.maxSize === 'object'
                  && typeof def.maxSize.error === 'string')
                sizeErr = def.maxSize.error;
              else
                sizeErr = 'File exceeded maximum size limit';
              onError(sizeErr);
            }
          };
        } else {
          onData = function(chunk) {
            filesize += chunk.length;
          };
        }

        stream.on('data', onData)
              .on('error', onError)
              .on('end', onEnd);
        streamcb(stream);
        return;
      }
    }
    stream.resume();
  }

  function onBBError(err) {
    errorCleanup(err);
  }

  function onBBFinish() {
    finished = true;
    maybeDone();
  }

  function maybeDone() {
    if (rulesLeft === 0
        && !hadError
        && finished
        && filesInProgress.length === 0) {
      var i = 0,
          k,
          keys = Object.keys(cfg),
          len = keys.length;

      for (; i < len; ++i) {
        k = keys[i];
        if (cfg[k].required && data[k] === undefined)
          return errorCleanup(k, 'Field is required');
      }

      self.data = data;
      cb();
    }
  }

  function onBBPipe(stream) {
    pipesrc = stream;
  }

  function onBBUnpipe(stream) {
    if (pipesrc === stream) {
      if (hadError && pipesrc.readable)
        pipesrc.resume();
      pipesrc = undefined;
    }
  }
};
