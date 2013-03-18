var fs        = require('fs'),
    crypto    = require('crypto'),
    express   = require('express'),
    pass      = require('passport'),
    BrowserID = require('passport-browserid').Strategy,
    mongoose  = require('mongoose');

var config,
    authorized = [];

function abort() {
  console.log.apply(console, arguments);
  process.exit(1);
}

(function loadConfig() {
  try {
    config = require('./config/server.json');
  } catch(e) {
    abort("Can't load config/server.json");
  }

  var example = ["example@example.net", "*@example.com"];
  if (!config.authorized || !config.authorized.length) {
    abort("Authorized is missing in config/server.json");
  }
  if (config.authorized.join() == example.join()) {
    abort("Authorized is not configured in config/server.json");
  }
  if (!config.port) {
    abort("Port is not configured in config/server.json");
  }
  if (!config.persona || !config.persona.audience) {
    abort("Persona audience is not configured in config/server.json");
  }
})();

(function prepareAuthorizedRegexps() {
  for (var i = 0, l = config.authorized.length; i < l; i++) {
    var pattern = config.authorized[i]
                        .replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&")
                        .replace("*", ".*");
    authorized.push(RegExp('^' + pattern + '$'));
  }
})();

function useSecret(callback) {
  fs.readFile('.secret', 'utf8', function(err, secret) {
    if (!err) { return callback(secret); }
    crypto.randomBytes(48, function(err, buf) {
      secret = buf.toString('hex');
      fs.writeFile('.secret', secret, 'utf8');
      callback(secret);
    });
  });
}

pass.serializeUser(function(user, done) {
  return done(null, user.email);
});

pass.deserializeUser(function(email, done) {
  return done(null, { email: email });
});

pass.use('browserid', new BrowserID({
    audience: config.persona.audience
  },
  function(email, done) {
    for (var i = 0, l = authorized.length; i < l; i++) {
      if (authorized[i].test(email)) {
        return done(null, { email: email });
      }
    }
    done(null, false);
  }
));

useSecret(function(secret) {
  var app = express();
  app.configure(function() {
    app.set('view engine', 'jade');
    app.set('views', __dirname + '/app/views');

    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.cookieSession({ secret: secret }));
    app.use(pass.initialize());
    app.use(pass.session());
    app.use(express.methodOverride());
    app.use(app.router);

    var db = mongoose.createConnection(config.mongodb.host, config.mongodb.database);
    db.on('error', function(err) {
      abort("Can't connect to mongodb: ", err);
    });
    db.once('open', function () {
      require('./app/controller')(app, db, pass);
      app.listen(config.port, function() {
        console.log('Express server listening on port ' + config.port);
      });
    });
  });

  app.configure('development', function() {
    app.use(express.static(__dirname + '/public'));
    app.use(express.logger('dev'));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  });

  app.configure('production', function() {
    app.use(express.errorHandler());
  });
});
