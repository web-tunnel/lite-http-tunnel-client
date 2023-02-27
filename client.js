const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const fetch = require('node-fetch');
const { io } = require('socket.io-client');
const HttpsProxyAgent = require('https-proxy-agent');
const { program, InvalidArgumentError, Argument } = require('commander');
const { TunnelRequest, TunnelResponse } = require('./lib');

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
  const initParams = {
    path: '/$web_tunnel',
    transports: ["websocket"],
    auth: {
      token: options.jwtToken,
    },
  };
  const http_proxy = process.env.https_proxy || process.env.http_proxy;
  if (http_proxy) {
    initParams.agent = new HttpsProxyAgent(http_proxy);
  }
  socket = io(options.server, initParams);

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
    const isWebSocket = request.headers.upgrade === 'websocket';
    console.log(`${isWebSocket ? 'WS' : request.method}: `, request.path);
    request.port = options.port;
    request.hostname = options.host;
    if (options.origin) {
      request.headers.host = options.origin;
    }
    const tunnelRequest = new TunnelRequest({
      requestId,
      socket: socket,
    });
    const localReq = http.request(request);
    tunnelRequest.pipe(localReq);
    const onTunnelRequestError = (e) => {
      tunnelRequest.off('end', onTunnelRequestEnd);
      localReq.destroy(e);
    };
    const onTunnelRequestEnd = () => {
      tunnelRequest.off('error', onTunnelRequestError);
    };
    tunnelRequest.once('error', onTunnelRequestError);
    tunnelRequest.once('end', onTunnelRequestEnd);
    const onLocalResponse = (localRes) => {
      localReq.off('error', onLocalError);
      if (isWebSocket && localRes.upgrade) {
        return;
      }
      const tunnelResponse = new TunnelResponse({
        responseId: requestId,
        socket: socket,
      });
      tunnelResponse.writeHead(
        localRes.statusCode,
        localRes.statusMessage,
        localRes.headers,
        localRes.httpVersion,
      );
      localRes.pipe(tunnelResponse);
    };
    const onLocalError = (error) => {
      console.log(error);
      localReq.off('response', onLocalResponse);
      socket.emit('request-error', requestId, error && error.message);
      tunnelRequest.destroy(error);
    };
    const onUpgrade = (localRes, localSocket, localHead) => {
      // localSocket.once('error', onTunnelRequestError);
      if (localHead && localHead.length) localSocket.unshift(localHead);
      const tunnelResponse = new TunnelResponse({
        responseId: requestId,
        socket: socket,
        duplex: true,
      });
      tunnelResponse.writeHead(
        null,
        null,
        localRes.headers
      );
      localSocket.pipe(tunnelResponse).pipe(localSocket);
    };
    localReq.once('error', onLocalError);
    localReq.once('response', onLocalResponse);

    if (isWebSocket) {
      localReq.on('upgrade', onUpgrade);
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

program
  .command('auth')
  .argument('<username>', 'JWT generator username')
  .argument('<password>', 'JWT generator password')
  .option('-p --profile <string>', 'setting profile name', 'default')
  .action(async (username, password, options) => {
    const configFilePath = path.resolve(os.homedir(), '.lite-http-tunnel', `${options.profile}.json`);
    if (!fs.existsSync(configFilePath)){
      console.log('Please config server firstly');
      return;
    }
    const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    const server = config.server;
    if (!server) {
      console.log('Please config server firstly');
      return;
    }
    const queryParams = new URLSearchParams();
    queryParams.append('username', username);
    queryParams.append('password', password);
    const response = await fetch(`${server}/tunnel_jwt_generator?${queryParams.toString()}`);
    if (response.status >= 400) {
      console.log('Auth failed as server response error, status: ', response.status);
      return;
    }
    const jwt = await response.text();
    config.jwtToken = jwt;
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log('Auth success');
  });

program.parse();
