var request = require('request'),
    Busboy = require('busboy'),
    Form = require('../lib/main').Form;

var http = require('http'),
    fs = require('fs'),
    path = require('path'),
    inspect = require('util').inspect,
    assert = require('assert');

var t = -1,
    group = path.basename(__filename, '.js') + '/',
    tmpdir = path.join(__dirname, 'temp'),
    fixturesdir = path.join(__dirname, 'fixtures');
var tests = [
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {},
            lastName: {},
            occupation: {}
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    expected: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    what: 'Simple fields, defaults, no validation'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              rules: [ { test: /^[A-Z]/, error: 'Bad capitalization' } ]
            },
            lastName: {
              rules: [ { test: /^[A-Z]/, error: 'Bad capitalization' } ]
            },
            occupation: {
              rules: [ { test: /^[A-Z]/, error: 'Bad capitalization' } ]
            }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    expected: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    what: 'Simple fields, defaults, regexp validation'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              rules: [ { test: /^[A-Z]/, error: 'Bad capitalization' } ]
            },
            lastName: {
              rules: [ { test: /^[a-z]/, error: 'Bad capitalization' } ]
            },
            occupation: {
              rules: [ { test: /^[A-Z]/, error: 'Bad capitalization' } ]
            }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(err, makeMsg(what, 'Expected form parse error'));
          assert(err.key === 'lastName',
                 makeMsg(what, 'Wrong failed field key: ' + err.key));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    expected: undefined,
    what: 'Simple fields, defaults, regexp validation fails (2nd field)'
  },
  { run: function() {
      function isNotEmpty(key, val) {
        return val.length > 0;
      }
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            lastName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            occupation: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    expected: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    what: 'Simple fields, defaults, sync function validation'
  },
  { run: function() {
      function isNotEmpty(key, val) {
        return val !== 'Baz';
      }
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            lastName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            occupation: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(err, makeMsg(what, 'Expected form parse error'));
          assert(err.key === 'occupation',
                 makeMsg(what, 'Wrong failed field key: ' + err.key));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    expected: undefined,
    what: 'Simple fields, defaults, sync function validation fails (last field)'
  },
  { run: function() {
      var i = 1;
      function isNotEmpty(key, val, cb) {
        setTimeout(function() { cb(null, val.length > 0); }, 100 * i++);
      }
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            lastName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            occupation: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    expected: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    what: 'Simple fields, defaults, async function validation'
  },
  { run: function() {
      var i = 1;
      function isNotEmpty(key, val, cb) {
        setTimeout(function() { cb(null, val !== 'Baz'); }, 100 * i++);
      }
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            lastName: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            },
            occupation: {
              rules: [ { test: isNotEmpty, error: 'Bad length' } ]
            }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(err, makeMsg(what, 'Expected form parse error'));
          assert(err.key === 'occupation',
                 makeMsg(what, 'Wrong failed field key: ' + err.key));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: 'Baz' },
    expected: undefined,
    what: 'Simple fields, defaults, async function validation fails (last field)'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            firstName: { required: true },
            lastName: { required: true },
            occupation: { required: true }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar', occupation: '' },
    expected: { firstName: 'Foo', lastName: 'Bar', occupation: '' },
    what: 'Simple fields, all required'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            firstName: { required: true },
            lastName: { required: true },
            occupation: { required: true }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(err, makeMsg(what, 'Expected form parse error'));
          assert(err.key === 'occupation',
                 makeMsg(what, 'Wrong failed field key: ' + err.key));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { firstName: 'Foo', lastName: 'Bar' },
    expected: undefined,
    what: 'Simple fields, all required, last one missing'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            num: { dataType: Number },
            str: {},
            timestamp: { dataType: Date.parse }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: {
      num: '007',
      str: 'foo',
      timestamp: 'Fri Apr 11 2014 22:06:39 GMT-0400'
    },
    expected: { num: 7, str: 'foo', timestamp: 1397268399000 },
    what: 'Simple field value conversion'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            words: { multiple: true },
            nums: { multiple: true }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    reqdata: { words: [ 'hello', 'world', 'foo' ], nums: 5 },
    expected: { words: [ 'hello', 'world', 'foo' ], nums: [ 5 ] },
    what: 'Simple fields with `multiple` set'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            csv: { buffered: true, encoding: 'utf8' },
            image: { buffered: true }
          }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    // bw 4/11/13 -- request/form-data/combined-stream/delayed-stream somehow
    // ends up missing all stream data even on node v0.10 where streams are
    // "paused" from the start, so we pause explicitly as a workaround ...
    reqdata: pauseFileStreams({
      csv: fs.createReadStream(path.join(fixturesdir, 'data.csv')),
      image: fs.createReadStream(path.join(fixturesdir, 'image.jpg'))
    }),
    expected: {
      csv: {
        data: fs.readFileSync(path.join(fixturesdir, 'data.csv'), 'utf8'),
        size: fs.statSync(path.join(fixturesdir, 'data.csv')).size
      },
      image: {
        data: fs.readFileSync(path.join(fixturesdir, 'image.jpg')),
        size: fs.statSync(path.join(fixturesdir, 'image.jpg')).size
      }
    },
    what: 'Buffered file fields with/without encoding'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            csv: { filename: path.join(tmpdir, 'data.csv') },
            image: { filename: true }
          }, { tmpdir: tmpdir }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          self.expected.csv.size = fs.statSync(path.join(tmpdir, 'data.csv'))
                                     .size;
          // temp filename is unknown beforehand, so we fill this in at runtime
          self.expected.image.filename = path.join(tmpdir,
                                                   fs.readdirSync(tmpdir)
                                                     .filter(function(v) {
                                                       return /\.tmp$/.test(v);
                                                     })[0]);
          self.expected.image.size = fs.statSync(self.expected.image.filename)
                                       .size;
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    // bw 4/11/13 -- request/form-data/combined-stream/delayed-stream somehow
    // ends up missing all stream data even on node v0.10 where streams are
    // "paused" from the start, so we pause explicitly as a workaround ...
    reqdata: pauseFileStreams({
      csv: fs.createReadStream(path.join(fixturesdir, 'data.csv')),
      image: fs.createReadStream(path.join(fixturesdir, 'image.jpg'))
    }),
    expected: {
      csv: {
        filename: path.join(tmpdir, 'data.csv'),
        size: 0 // filled in at runtime
      },
      image: {
        filename: '', // filled in at runtime
        size: 0 // filled in at runtime
      }
    },
    what: 'Unbuffered file fields'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            image: { buffered: true, maxSize: 4096 }
          }, { tmpdir: tmpdir }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(err, makeMsg(what, 'Expected form parse error'));
          assert(err.key === 'image',
                 makeMsg(what, 'Wrong failed field key: ' + err.key));
          assertDataEquals(self.expected, form.data);
          next();
        });
      });
    },
    bbopts: {},
    // bw 4/11/13 -- request/form-data/combined-stream/delayed-stream somehow
    // ends up missing all stream data even on node v0.10 where streams are
    // "paused" from the start, so we pause explicitly as a workaround ...
    reqdata: pauseFileStreams({
      image: fs.createReadStream(path.join(fixturesdir, 'image.jpg'))
    }),
    expected: undefined,
    what: 'Unbuffered file field, max size exceeded'
  },
  { run: function() {
      var self = this,
          what = this.what,
          nb = 0,
          form = new Form({
            image: {
              stream: function(stream) {
                stream.on('data', function(d) { nb += d.length; });
                stream.resume();
              }
            }
          }, { tmpdir: tmpdir }),
          srvclose;
      makeServer(this.bbopts, function(port, fnclose) {
        srvclose = fnclose;
        post(port, self.reqdata);
      }, function(bb) {
        srvclose();
        form.parse(bb, function(err) {
          assert(!err, makeMsg(what, 'Unexpected form parse error: ' + err));
          assertDataEquals(self.expected, form.data);
          assert(self.expected.image.size === nb,
                 makeMsg(what, 'Stream callback byte count mismatch\nExpected: '
                             + self.expected.image.size
                             + '\nActual: '
                             + nb));
          next();
        });
      });
    },
    bbopts: {},
    // bw 4/11/13 -- request/form-data/combined-stream/delayed-stream somehow
    // ends up missing all stream data even on node v0.10 where streams are
    // "paused" from the start, so we pause explicitly as a workaround ...
    reqdata: pauseFileStreams({
      image: fs.createReadStream(path.join(fixturesdir, 'image.jpg'))
    }),
    expected: { image: { size: 17618 } },
    what: 'Streamed file field'
  },
];

function pauseFileStreams(reqdata) {
  var key;
  for (key in reqdata) {
    if (reqdata[key]._readableState)
      reqdata[key].pause();
  }
  return reqdata;
}

function post(port, formvals) {
  var reqform = request.post('http://localhost:' + port).form(),
      key;
  for (key in formvals) {
    if (Array.isArray(formvals[key])) {
      for (var i = 0, len = formvals[key].length; i < len; ++i)
        reqform.append(key, formvals[key][i]);
    } else
      reqform.append(key, formvals[key]);
  }
}

function makeServer(bbopts, srvCb, reqCb) {
  var srv = http.createServer(function(req, res) {
    if (req.method === 'POST') {
      try {
        var cfg = {},
            responded = false,
            finished = false,
            bb,
            key;
        for (key in (bbopts || {}))
          cfg[key] = bbopts[key];
        cfg.headers = req.headers;
        bb = new Busboy(cfg);
        reqCb(bb);
        bb.on('error', function() {
          if (!responded) {
            responded = true;
            res.writeHead(400);
            res.end();
          }
        }).on('finish', function() {
          finished = true;
          if (!responded) {
            responded = true;
            res.writeHead(200);
            res.end();
          }
        });
        req.on('end', function() {
          if (!responded && !finished) {
            responded = true;
            res.writeHead(400);
            res.end();
          }
        });
        req.pipe(bb);
      } catch (err) {
        res.writeHead(400);
        res.end();
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
  srv.listen(0, 'localhost', function() {
    srvCb(srv.address().port, function() { srv.close(); });
  });
}

function assertDataEquals(expected, actual) {
  if (expected === actual)
    return;

  var expKeys = (expected && Object.keys(expected)) || [],
      actKeys = (actual && Object.keys(actual)) || [];

  assert.equal(expKeys.length,
               actKeys.length,
               makeMsg(tests[t].what,
                       'Mismatched fields lengths\nExpected: '
                       + expKeys.length + ' field(s): '
                       + expKeys
                       + '\nActual: '
                       + actKeys.length + ' field(s): '
                       + actKeys));

  var len = expKeys.length;
  for (var i = 0; i < len; ++i) {
    assert.equal(expKeys[i],
                 actKeys[i],
                 makeMsg(tests[t].what,
                         'Mismatched field names\nExpected: '
                         + inspect(expKeys[i])
                         + '\nActual: '
                         + inspect(actKeys[i])));
    assert.deepEqual(expected[expKeys[i]],
                     actual[actKeys[i]],
                     makeMsg(tests[t].what,
                             'Mismatched field values\nExpected: '
                             + inspect(expected[expKeys[i]])
                             + '\nActual: '
                             + inspect(actual[actKeys[i]])));
  }
}

function cleanupTemp() {
  // clean up any temporary files left over
  fs.readdirSync(tmpdir).forEach(function(file) {
    if (file !== '.gitignore')
      fs.unlinkSync(path.join(tmpdir, file));
  });
}

function next() {
  if ((t + 1) === tests.length)
    return;
  cleanupTemp();
  var v = tests[++t];
  v.run.call(v);
}
next();

function makeMsg(what, msg) {
  return '[' + group + what + ']: ' + msg;
}

process.on('exit', function() {
  cleanupTemp();

  assert((t + 1) === tests.length,
         makeMsg('_exit',
                 'Only finished ' + (t + 1) + '/' + tests.length + ' tests'));
});