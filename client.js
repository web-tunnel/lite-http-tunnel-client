const os = require('os');
const fs = require('fs');
const path = require('path');
const http   = require('http');
const { io } = require('socket.io-client');
const { program, InvalidArgumentError, Argument } = require('commander');
const { SocketRequest, SocketResponse } = require('./lib');

let socket = null;

function keepAlive() {
  setTimeout(() => {
    if (socket && socket.connected) {
      socket.send('ping');
    }
    keepAlive();
  }, 5000);
}

function initClient(options) {
  socket = io(options.server, {
    path: '/$web_tunnel',
    transports: ["websocket"],
    auth: {
      token: options.jwtToken,
    },
  });

  socket.on('connect', () => {
    if (socket.connected) {
      console.log('client connect to server successfully');
    }
  });

  socket.on('connect_error', (e) => {
    console.log('connect error', e && e.message);
  });

  socket.on('disconnect', () => {
    console.log('client disconnected');
  });

  socket.on('request', (requestId, request) => {
    console.log(`${request.method}: `, request.path);
    request.port = options.port;
    request.hostname = options.host;
    if (options.origin) {
      request.headers.host = options.origin;
    }
    const socketRequest = new SocketRequest({
      requestId,
      socket: socket,
    });
    const localReq = http.request(request);
    socketRequest.pipe(localReq);
    const onSocketRequestError = (e) => {
      socketRequest.off('end', onSocketRequestEnd);
      localReq.destroy(e);
    };
    const onSocketRequestEnd = () => {
      socketRequest.off('error', onSocketRequestError);
    };
    socketRequest.once('error', onSocketRequestError);
    socketRequest.once('end', onSocketRequestEnd);
    const isWebSocketProxyRequest = request.headers.upgrade === 'websocket';
    const onLocalResponse = (localRes) => {
      localReq.off('error', onLocalError);
      if (isWebSocketProxyRequest && localRes.upgrade) {
        return;
      }
      const socketResponse = new SocketResponse({
        responseId: requestId,
        socket: socket,
      });
      socketResponse.writeHead(
        localRes.statusCode,
        localRes.statusMessage,
        localRes.headers,
        localRes.httpVersion,
      );
      localRes.pipe(socketResponse);
    };
    const onLocalError = (error) => {
      console.log(error);
      localReq.off('response', onLocalResponse);
      socket.emit('request-error', requestId, error && error.message);
      socketRequest.destroy(error);
    };
    localReq.once('error', onLocalError);
    localReq.once('response', onLocalResponse);

    if (request.headers.upgrade === 'websocket') {
      localReq.on('upgrade', (localRes, localSocket, localHead) => {
        // localSocket.once('error', onSocketRequestError);
        if (localHead && localHead.length) localSocket.unshift(localHead);
        const socketResponse = new SocketResponse({
          responseId: requestId,
          socket: socket,
          duplex: true,
        });
        socketResponse.writeHead(
          null,
          null,
          localRes.headers
        );
        localSocket.pipe(socketResponse).pipe(localSocket);
      });
      return;
    }
  });
  keepAlive();
}

program
  .name('lite-http-tunnel')
  .description('HTTP tunnel client')

program
  .command('start')
  .argument('<port>', 'local server port number', (value) => {
    const port = parseInt(value, 10);
    if (isNaN(port)) {
      throw new InvalidArgumentError('Not a number.');
    }
    return port;
  })
  .option('-p, --profile <string>', 'setting profile name', 'default')
  .option('-h, --host <string>', 'local host value', 'localhost')
  .option('-o, --origin <string>', 'change request origin')
  .action((port, options) => {
    const configDir = path.resolve(os.homedir(), '.lite-http-tunnel');
    if (!fs.existsSync(configDir)){
      fs.mkdirSync(configDir);
    }
    let config = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    }
    if (!config.server) {
      console.log('Please set remote tunnel server firstly');
      return;
    }
    if (!config.jwtToken) {
      console.log(`Please set jwt token for ${config.server} firstly`);
      return;
    }
    options.port = port;
    options.jwtToken = config.jwtToken;
    options.server = config.server;
    initClient(options);
  });

program
  .command('config')
  .addArgument(new Argument('<type>', 'config type').choices(['jwt', 'server']))
  .argument('<value>', 'config value')
  .option('-p --profile <string>', 'setting profile name', 'default')
  .action((type, value, options) => {
    const configDir = path.resolve(os.homedir(), '.lite-http-tunnel');
    if (!fs.existsSync(configDir)){
      fs.mkdirSync(configDir);
    }
    let config = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    }
    if (type === 'jwt') {
      config.jwtToken = value;
    }
    if (type === 'server') {
      config.server = value;
    }
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log(`${type} config saved successfully`);
  });

program.parse();
