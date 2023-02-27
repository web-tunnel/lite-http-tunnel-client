# Lite HTTP Tunnel - Client

Lite HTTP Tunnel client to connect [Lite HTTP Tunnel server](https://github.com/embbnux/lite-http-tunnel).

## Usage

Firstly, please follow [here](https://github.com/embbnux/lite-http-tunnel#usage) to have your [Lite HTTP Tunnel server](https://github.com/embbnux/lite-http-tunnel).

### Installation

```
$ npm i -g lite-http-tunnel
$ lite-http-tunnel -h
```

### Setup

Config remote public server address:

```
$ lite-http-tunnel config server https://your_web_host_domain
```

Auth with tunnel server:

```shell
$ lite-http-tunnel auth $JWT_GENERATOR_USERNAME $JWT_GENERATOR_PASSWORD
```

 > Replace `$JWT_GENERATOR_USERNAME` and `$JWT_GENERATOR_PASSWORD` with values that you provide at tunnel server

### Start client

```
$ lite-http-tunnel start your_local_server_port
```

Please replace your_local_server_port with your local HTTP server port, eg: `8080`.

After that you can access your local HTTP server by access `your_public_server_domain`.

Change origin:

```
$ lite-http-tunnel start your_local_server_port -o localhost:5000
```
