var fs = require('fs'),
    path = require('path'),
    os = require('os');

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

  this.data = undefined;

  bb.once('pipe', onBBPipe)
    .once('unpipe', onBBUnpipe)
    .on('error', onBBError)
    .on('finish', onBBFinish);

  var hasFile = false,
      hasField = false;
  for (var i = 0, keys = Object.keys(cfg), len = keys.length; i < len; ++i) {
    var isFile = (cfg[keys[i]].filename !== undefined);
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
    var keys = Object.keys(cfg),
        k;
    for (i = 0, len = keys.length; i < len; ++i) {
      k = keys[i];
      if (cfg[k].filename !== undefined
          && data[k]
          && typeof data[k].filename === 'string')
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

    if (pipesrc) {
      pipesrc.unpipe(bb);
      pipesrc = undefined;
    }

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
    if (cfg[key] && cfg[key].filename === undefined) {
      var def = cfg[key],
          multiple = def.multiple;

      if (!multiple && data[key] !== undefined)
        return;

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
                r.test.call(data, key, val, function(passed) {
                  if (passed === false)
                    return errorCleanup(key, r.error);
                  else if (passed instanceof Error
                           || typeof passed === 'string')
                    return errorCleanup(key, passed);
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
    if (cfg[key] && cfg[key].filename !== undefined) {
      var def = cfg[key],
          multiple = (typeof def === 'object' ? def.multiple : false),
          filename = (typeof def === 'object' ? def.filename : def),
          filesize = 0,
          onData,
          onEnd,
          fileDisk,
          maxSize;

      if (!multiple && data[key] !== undefined)
        return stream.resume();

      function onError(err) {
        var idx = filesInProgress.indexOf(stream);
        if (idx > -1)
          filesInProgress.splice(idx, 1);

        stream.unpipe(fileDisk)
              .removeListener('data', onData)
              .removeListener('error', onError)
              .removeListener('end', onEnd);
        if (fileDisk)
          fileDisk.removeListener('error', onError);

        errorCleanup(key, err);
      }

      if (typeof filename === 'string') {
        filesInProgress.push(stream);

        if (filename.length === 0) {
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
                    r.test(key, filename, filesize, function(passed) {
                      if (passed === false)
                        return errorCleanup(key, r.error);
                      else if (passed instanceof Error
                               || typeof passed === 'string')
                        return errorCleanup(key, passed);
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
              .on('end', onEnd)
              .pipe(fileDisk);
        return;
      } else if (filename === false) {
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
                    r.test(key, val, filesize, function(passed) {
                      if (passed === false)
                        return errorCleanup(key, r.error);
                      else if (passed instanceof Error
                               || typeof passed === 'string')
                        return errorCleanup(key, passed);
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
    if (rulesLeft === 0 && !hadError && finished) {
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
    if (pipesrc === stream)
      pipesrc = undefined;
  }
};
