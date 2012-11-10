var fs = require('fs');
var http = require('http');
var exec = require('child_process').exec;
var GitHttp = require('./index');
var mkdirp = require('mkdirp');
var rmrf = require('rimraf');

describe('git-http', function() {
  before(function(done) {
    rmrf('test-origin.git', onRmDir);

    function onRmDir(err) {
      if (err) { return done(err); }
      mkdirp('test-origin.git', onMakeGitDir);
    }

    function onMakeGitDir(err) {
      if (err) { return done(err); }
      exec('git init', { cwd: 'test-origin.git' }, onGitInit);
    }

    function onGitInit(err, stdout, stdin) {
      if (err) { return done(err); }
      fs.writeFileSync('test-origin.git/README', 'test file');
      exec('git add .', { cwd: 'test-origin.git' }, onGitAdd);
    }

    function onGitAdd(err, stdout, stdin) {
      if (err) { return done(err); }
      exec('git commit -m "comment"', { cwd: 'test-origin.git' }, onGitCommit);
    }

    function onGitCommit(err, stdout, stdin) {
      if (err) { return done(err); }
      done();
    }
  });

  it('should deny pull', function(done) {
    var gitHttp = new GitHttp();
    gitHttp.addRepo('/test-origin.git', 'test-origin.git');
    gitHttp.on('pull', function(pull) {
      pull.deny()
    });
    http.createServer(function(req, res) {
      gitHttp.handle(req, res);
    }).listen(7000);
    exec('git clone http://localhost:7000/test-origin.git', { cwd: '.' }, onGitClone);

    function onGitClone(err, stdout, stdin) {
      if (err) {
        done();
      } else {
        done('operation should have been denied');
      }
    }
  });
});
