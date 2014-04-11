Description
===========

A high-level form field handling and validation module for [busboy](https://github.com/mscdex/busboy).


Requirements
============

* [node.js](http://nodejs.org/) -- v0.10.0+
* [connect-busboy](https://github.com/mscdex/connect-busboy) (only useful when using this module with [Express](http://expressjs.com))
* [busboy](https://github.com/mscdex/busboy) (only needed if not using with [Express](http://expressjs.com))


Install
============

    npm install reformed


Examples
========

* Parse and validate a form with Express and connect-busboy:

```javascript
var express = require('express'),
    app = express(),
    busboy = require('connect-busboy'),
    form = require('reformed');

// ...

// you should probably do better email validation than this in production
function isValidEmail(key, val) {
  return val.length > 0 && val.length < 255 && val.indexOf('@') > -1;
}

// add a callback parameter for async validation
function usernameUnused(key, val, cb) {
  // db is some SQL database connection ...
  db.query('SELECT id FROM users WHERE username = ? LIMIT 1'
           [ val ],
           function(err, rows) {
    if (err)
      return cb(err);
    cb(!rows || !rows.length);
  });
}

// ...

app.post('/signup',
         busboy({
           limits: {
             fields: 10, // max 10 non-multipart fields
             parts: 10, // max 10 multipart fields
             fileSize: 8 * 1000 * 1000 // files can be at most 8MB each
           }
         }),
         form({
           firstName: {
             rules: [ { test: /^.{0,50}$/, error: 'First name must be 50 characters or less' } ]
           },
           lastName: {
             rules: [ { test: /^.{0,50}$/, error: 'Last name must be 50 characters or less' } ]
           },
           emailAddress: {
             required: true,
             rules: [ { test: isValidEmail, error: 'Invalid email address' } ]
           },
           avatar: {
             filename: '', // use temporary file
             maxSize: {
               size: 1 * 1024 * 1024, // 1MB
               error: 'Avatar file size too large (must be 1MB or less)'
             }
           },
           username: {
             required: true,
             rules: [
              { test: /^\w{6,20}$/, error: 'Username must be between 6 and 20 alphanumeric or underscore characters' },
              { test: usernameUnused, error: 'Username already in use' }
            ]
           },
           password: {
             required: true,
             rules: [ { test: /^.{6,}$/, error: 'Password must be at least 6 characters' } ]
           }
         }),
         function(err, req, res, next) {
           if (!err || (err && err.key))
             next(); // no error or validation-related error
           else
             next(err); // parser or other critical error
         },
         function(req, res, next) {
           if (req.form.error) {
             // `req.form.data` will always be undefined in case of error
             return res.send(400, 'Form error for field "'
                                  + req.form.error.key
                                  + '": '
                                  + req.form.error);
           }

           // if we had no required fields, `req.form.data` could be undefined
           // if no form data was submitted

           // use `req.form.data` here ...

           res.send(200, 'Thank you for your form submission!');
         }
);

app.listen(8000);
```

* Parse and validate a form manually (without Express):

```javascript
var http = require('http'),
    Busboy = require('busboy'),
    Form = require('reformed').Form;

// ...

// you should probably do better email validation than this in production
function isValidEmail(key, val) {
  return val.length > 0 && val.length < 255 && val.indexOf('@') > -1;
}

// add a callback parameter for async validation
function usernameUnused(key, val, cb) {
  // db is some SQL database connection ...
  db.query('SELECT id FROM users WHERE username = ? LIMIT 1'
           [ val ],
           function(err, rows) {
    if (err)
      return cb(err);
    cb(!rows || !rows.length);
  });
}

// ...

var signupFormCfg = {
  firstName: {
    rules: [ { test: /^.{0,50}$/, error: 'First name must be 50 characters or less' } ]
  },
  lastName: {
    rules: [ { test: /^.{0,50}$/, error: 'Last name must be 50 characters or less' } ]
  },
  emailAddress: {
    required: true,
    rules: [ { test: isValidEmail, error: 'Invalid email address' } ]
  },
  avatar: {
    filename: '', // use temporary file
    maxSize: {
      size: 1 * 1024 * 1024, // 1MB
      error: 'Avatar file size too large (must be 1MB or less)'
    }
  },
  username: {
    required: true,
    rules: [
     { test: /^\w{6,20}$/, error: 'Username must be between 6 and 20 alphanumeric or underscore characters' },
     { test: usernameUnused, error: 'Username already in use' }
   ]
  },
  password: {
    required: true,
    rules: [ { test: /^.{6,}$/, error: 'Password must be at least 6 characters' } ]
  }
};

http.createServer(function(req, res) {
  if (req.method === 'POST' && req.url === '/signup') {
    try {
      var bb = new Busboy({
            headers: req.headers,
            limits: {
              fields: 10, // max 10 non-multipart fields
              parts: 10, // max 10 multipart fields
              fileSize: 8 * 1000 * 1000 // files can be at most 8MB each
            }
          }),
          form = new Form(signupFormCfg);

      form.parse(bb, function(err) {
        if (err) {
          // `form.data` will always be undefined in case of error
          res.writeHead(err.key === undefined ? 500 : 400);
          res.end(''+err);
          return;
        }

        // if we had no required fields, `form.data` could be undefined
        // if no form data was submitted

        // use `form.data` here ...

        res.writeHead(200);
        res.end('Thank you for your form submission!');
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
}).listen(8000);
```


API
===

`require('reformed')` returns connect/express middleware.
`require('reformed').Form` returns the **_Form_** class.


Form methods
------------

* **(constructor)**(< _object_ >fieldDefs[, < _object_ >options]) - Creates and returns a new Form instance. `fieldDefs` contains the form field definitions to be used for filtering and/or validation. `fieldDefs` is keyed on the field name and the value is an object that can contain any of the following properties:

    *  **dataType** - < _function_ > - A function that takes in a non-file field value (string) or a buffered file field value (Buffer) and returns some other value. The default is to leave the value as-is.

    *  **required** - < _boolean_ > - Indicates whether the field is required to be present in order for validation to pass. The default is `false`.

    *  **multiple** - < _boolean_ > - Allow multiple instances of the same field. If `true`, this will set the field data value to an array of values. If `false`, the first value is kept and subsequent values are ignored. The default is `false`.

    *  **encoding** - < _string_ > - For buffered file fields, this is the Buffer encoding to use to convert the Buffer to a string. If `dataType` is present, that takes precedence over this setting. The default is to leave the value as-is.

    * **filename** - < _mixed_ > - Set to a non-empty string to be used as the path to save this file to. Set to an empty string to save the file to a temporary file. Set to `false` to buffer the entire file contents in memory as a Buffer. **Note:** this setting is **required** for file fields

    *  **maxSize** - < _mixed_ > - Set to a number to restrict the max file size and use the default error message. Set to an object with `size` as the max file size and `error` as a custom string error message. If a max file size is set, it only takes effect if it is smaller than any configured busboy (global) max file size limit. The default is no limit (aside from any configured busboy limit).

    *  **rules** - < _array_ > - A list of rules to apply for validation for this field. The default is to apply no rules. Each rule has the following fields:

        *  **test** - < _mixed_ > - Set to a regular expression or a function. If a regular expression is used with file fields (buffered or not), the contents of the files are converted to binary strings first before testing the regular expression. Functions are called synchronously if the function has (2) `(key, val)` parameters for non-file fields or (3) `(key, filename, filesize)` parameters for file fields. These synchronous functions must return a boolean to indicate passage of the test, an _Error_ instance to use instead of the defined `error` (no `key` property will be set -- useful for critical/system errors), or a string as a direct replacement for `error`. Functions are called asynchronously if the function has (3) `(key, val, callback)` parameters for non-file fields or (4) `(key, filename, filesize, callback)` parameters for file fields. These asynchronous functions must pass to the callback a boolean to indicate passage of the test, an _Error_ instance to use instead of the defined `error` (no `key` property will be set -- useful for critical/system errors), or a string as a direct replacement for `error`. All functions are called with `this` set to the current entire data storage object (this can be handy for example for checking for other fields or ensuring a max number of fields that have `multiple: true` set).

        *  **error** - < _string_ > - The (default) error message to use when the test fails.

  `options` is an optional object with the following valid properties:

    * **tmpdir** - < _string_ > - A path to be used for storing temporary files for file fields that do not have a specific filename set. If this is not provided, `os.tmpdir()` will be used.

* **parse**(< _Busboy_ >bb, < _function_ >callback) - _(void)_ - Starts reading form fields from the Busboy instance `bb`. `callback` is passed an _Error_ object on error. If a field didn't pass validation, the error passed to the callback will have a `key` property set to the field name that failed validation. In case there were no errors, any/all form data is available on `form.data`, which could be undefined if nothing was submitted and no required fields were configured. For non-file fields, the value is just the literal data value. For non-buffered file fields, the value is an object with `filename` set to the path of the stored file and `filesize` set to the size of the file. For buffered file fields, the value is an object with `data` set to a Buffer containing the file contents and `filesize` set to the `data` length.
