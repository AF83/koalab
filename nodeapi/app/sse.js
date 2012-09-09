var EventEmitter = require('events').EventEmitter,
    ee = new EventEmitter();

exports = module.exports = function broadcast(action, Model, model) {
  var data = {
    action : action,
    type   : Model.modelName,
    model  : model
  };
  ee.emit('message', data);
};

exports.middleware = function(req, res) {
  var messageCount = 0;
  req.socket.setTimeout(Infinity);

  res.writeHead(200, {
    'Content-Type'  : 'text/event-stream',
    'Cache-Control' : 'no-cache',
    'Connection'    : 'keep-alive'
  });
  res.write('\n');

  var listener = function(data) {
    messageCount++;

    if (typeof data !== 'string')
      data = JSON.stringify(data);

    res.write('id: ' + messageCount + '\n');
    res.write('data: ' + data + '\n\n');
  };

  ee.on('message', listener);

  req.on('close', function() {
    ee.removeListener('message', listener);
  });
};
