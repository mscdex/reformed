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
    tmpdir = __dirname + '/temp';
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
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    expected: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
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
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    expected: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
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
          assert(form.data === undefined, makeMsg(what, 'Unexpected data'));
          next();
        });
      });
    },
    bbopts: {},
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
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
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    expected: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
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
          assert(form.data === undefined, makeMsg(what, 'Unexpected data'));
          next();
        });
      });
    },
    bbopts: {},
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    expected: undefined,
    what: 'Simple fields, defaults, sync function validation fails (last field)'
  },
  { run: function() {
      var i = 1;
      function isNotEmpty(key, val, cb) {
        setTimeout(function() { cb(val.length > 0); }, 100 * i++);
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
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    expected: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    what: 'Simple fields, defaults, async function validation'
  },
  { run: function() {
      var i = 1;
      function isNotEmpty(key, val, cb) {
        setTimeout(function() { cb(val !== 'Baz'); }, 100 * i++);
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
          assert(form.data === undefined, makeMsg(what, 'Unexpected data'));
          next();
        });
      });
    },
    bbopts: {},
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    expected: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    what: 'Simple fields, defaults, async function validation fails (last field)'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              required: true
            },
            lastName: {
              required: true
            },
            occupation: {
              required: true
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
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: ''
    },
    expected: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: ''
    },
    what: 'Simple fields, all required'
  },
  { run: function() {
      var self = this,
          what = this.what,
          form = new Form({
            firstName: {
              required: true
            },
            lastName: {
              required: true
            },
            occupation: {
              required: true
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
          assert(form.data === undefined, makeMsg(what, 'Unexpected data'));
          next();
        });
      });
    },
    bbopts: {},
    reqdata: {
      firstName: 'Foo',
      lastName: 'Bar'
    },
    expected: {
      firstName: 'Foo',
      lastName: 'Bar',
      occupation: 'Baz'
    },
    what: 'Simple fields, all required, last one missing'
  },
];

function post(port, formvals) {
  var reqform = request.post('http://localhost:' + port).form(),
      key;
  for (key in formvals)
    reqform.append(key, formvals[key]);
}

function makeServer(bbopts, srvCb, reqCb) {
  var srv = http.createServer(function(req, res) {
    if (req.method === 'POST') {
      try {
        var cfg = {},
            hadError = false,
            bb,
            key;
        for (key in bbopts)
          cfg[key] = bbopts[key];
        cfg.headers = req.headers;
        bb = new Busboy(cfg);
        reqCb(bb);
        bb.on('error', function() {
          hadError = true;
          res.writeHead(400);
          res.end();
        }).on('finish', function() {
          if (!hadError) {
            res.writeHead(200);
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
  var expKeys = Object.keys(expected),
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

function next() {
  if ((t + 1) === tests.length)
    return;
  var v = tests[++t];
  v.run.call(v);
}
next();

function makeMsg(what, msg) {
  return '[' + group + what + ']: ' + msg;
}

process.on('exit', function() {
  // clean up any temporary files left over
  fs.readdirSync(tmpdir).forEach(function(file) {
    if (file !== '.gitignore')
      fs.unlinkSync(file);
  });

  assert((t + 1) === tests.length,
         makeMsg('_exit',
                 'Only finished ' + (t + 1) + '/' + tests.length + ' tests'));
});