var path = require('path');
var events = require('events');
var url = require('url');
var util = require('util');
var querystring = require('querystring');
var spawn = require('child_process').spawn;

var ROUTES = [
  ["POST", '_uploadPack',      "(.*?)/git-upload-pack$"],
  ["POST", '_receivePack',     "(.*?)/git-receive-pack$"],
  ["GET",  '_getInfoRefs',     "(.*?)/info/refs$"],
];

module.exports = GitHttp;

function GitHttp(config) {
  config = config || {};
  this.gitPath = config.gitPath || 'git';
  this.repos = {};
}
util.inherits(GitHttp, events.EventEmitter);

GitHttp.prototype.addRepo = function(httpPath, fsPath) {
  this.repos[httpPath] = fsPath;
};

GitHttp.prototype.removeRepo = function(httpPath) {
  delete this.repos[httpPath];
};

GitHttp.prototype.handle = function(req, res) {
  var pathname = url.parse(req.url).pathname;
  console.log('req', pathname);
  for (var i = 0; i < ROUTES.length; i++) {
    var regex = new RegExp(ROUTES[i][2]);
    var match = pathname.match(regex);
    if (match) {
      console.log('matched route', pathname);
      var httpPath = match[1];
      if (this.repos[httpPath]) {
        return this[ROUTES[i][1]](req, res, httpPath);
      }
    }
  }

  res.writeHead(404);
  res.end();
};

GitHttp.prototype._uploadPack = function(req, res, gitHttpPath) {
  this.emit('pull', {
    req: req,
    res: res,
    httpPath: gitHttpPath,
    fsPath: this.repos[gitHttpPath],
    allow: function() {
      this.serviceRpc('upload-pack', req, res, gitHttpPath);
    }.bind(this),
    deny: function() {
      res.writeHead(403);
      res.end();
    }
  });
};

GitHttp.prototype._receivePack = function(req, res, gitHttpPath) {
  this.emit('push', {
    req: req,
    res: res,
    httpPath: gitHttpPath,
    fsPath: this.repos[gitHttpPath],
    allow: function() {
      this.serviceRpc('receive-pack', req, res, gitHttpPath);
    }.bind(this),
    deny: function() {
      res.writeHead(403);
      res.end();
    }
  });
};

GitHttp.prototype.serviceRpc = function(rpc, req, res, gitHttpPath) {
  //return render_no_access if !has_access(@rpc, true)
  res.writeHead(200, {
    "content-type": util.format('application/x-git-%s-result', rpc),
  });

  var ps = spawn(this.gitPath, [rpc, '--stateless-rpc', this.repos[gitHttpPath]]);
  ps.on('close', res.end.bind(res));
  req.pipe(ps.stdin);
  ps.stdout.pipe(res);
};

GitHttp.prototype._getInfoRefs = function(req, res, gitHttpPath) {
  var serviceName = getServiceType(req);

  res.writeHead(200, {
    "content-type": util.format("application/x-git-%s-advertisement", serviceName),
    "expires": "Fri, 01 Jan 1980 00:00:00 GMT",
    "pragma": "no-cache",
    "cache-control": "no-cache, max-age=0, must-revalidate"
  });
  res.write(pktWrite('# service=git-' + serviceName + '\n'));
  res.write(pktFlush());

  var ps = spawn(this.gitPath, [serviceName, '--stateless-rpc', '--advertise-refs', '.'], { cwd: this.repos[gitHttpPath] });
  ps.on('close', res.end.bind(res));
  ps.stdout.pipe(res);
};

function getServiceType(req) {
  var serviceType = querystring.parse(url.parse(req.url).query).service;
  if (!serviceType) {
    return false;
  }
  if (!/^git-/.test(serviceType)) {
    return false;
  }
  return serviceType.replace('git-', '');
}

// packet line handling functions
function pktFlush() {
  return '0000';
}

function pktWrite(str, res) {
  return rjust((str.length + 4).toString(16), 4, '0') + str;
}

// helpers
function rjust(str, num, char) {
  var result = '';
  for (var i = 0; i < num - str.length; i++) {
    result = result + char;
  }
  return result + str;
}
