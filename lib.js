const stream = require('stream');

class SocketRequest extends stream.Readable {
  constructor({ socket, requestId }) {
    super();
    this._socket = socket;
    this._requestId = requestId;
    const onRequestPipe = (requestId, data) => {
      if (this._requestId === requestId) {
        this.push(data);
      }
    };
    const onRequestPipes = (requestId, data) => {
      if (this._requestId === requestId) {
        data.forEach((chunk) => {
          this.push(chunk);
        });
      }
    };
    const onRequestPipeError = (requestId, error) => {
      if (this._requestId === requestId) {
        this._socket.off('request-pipe', onRequestPipe);
        this._socket.off('request-pipes', onRequestPipes);
        this._socket.off('request-pipe-error', onRequestPipeError);
        this._socket.off('request-pipe-end', onRequestPipeEnd);
        this.destroy(new Error(error));
      }
    };
    const onRequestPipeEnd = (requestId, data) => {
      if (this._requestId === requestId) {
        this._socket.off('request-pipe', onRequestPipe);
        this._socket.off('request-pipes', onRequestPipes);
        this._socket.off('request-pipe-error', onRequestPipeError);
        this._socket.off('request-pipe-end', onRequestPipeEnd);
        if (data) {
          this.push(data);
        }
        this.push(null);
      }
    };
    this._socket.on('request-pipe', onRequestPipe);
    this._socket.on('request-pipes', onRequestPipes);
    this._socket.on('request-pipe-error', onRequestPipeError);
    this._socket.on('request-pipe-end', onRequestPipeEnd);
  }

  _read() {}
}

class SocketResponse extends stream.Duplex {
  constructor({ socket, responseId, duplex }) {
    super();
    this._socket = socket;
    this._responseId = responseId;
    if (duplex) {
      // for websocket request： bidirection
      const onResponsePipe = (responseId, data) => {
        if (this._responseId === responseId) {
          this.push(data);
        }
      };
      const onResponsePipes = (responseId, data) => {
        if (this._responseId === responseId) {
          data.forEach((chunk) => {
            this.push(chunk);
          });
        }
      };
      const onResponsePipeError = (responseId, error) => {
        if (this._responseId === responseId) {
          this._socket.off('response-pipe', onResponsePipe);
          this._socket.off('response-pipes', onResponsePipes);
          this._socket.off('response-pipe-error', onResponsePipeError);
          this._socket.off('response-pipe-end', onResponsePipeEnd);
          this.destroy(new Error(error));
        }
      };
      const onResponsePipeEnd = (responseId, data) => {
        if (this._responseId === responseId) {
          this._socket.off('response-pipe', onResponsePipe);
          this._socket.off('response-pipes', onResponsePipes);
          this._socket.off('response-pipe-error', onResponsePipeError);
          this._socket.off('response-pipe-end', onResponsePipeEnd);
          if (data) {
            this.push(data);
          }
          this.push(null);
        }
      };
      this._socket.on('response-pipe', onResponsePipe);
      this._socket.on('response-pipes', onResponsePipes);
      this._socket.on('response-pipe-error', onResponsePipeError);
      this._socket.on('response-pipe-end', onResponsePipeEnd);
    }
  }

  _write(chunk, encoding, callback) {
    this._socket.emit('response-pipe', this._responseId, chunk);
    this._socket.io.engine.once('drain', () => {
      callback();
    });
  }

  _writev(chunks, callback) {
    this._socket.emit('response-pipes', this._responseId, chunks);
    this._socket.io.engine.once('drain', () => {
      callback();
    });
  }

  _final(callback) {
    this._socket.emit('response-pipe-end', this._responseId);
    this._socket.io.engine.once('drain', () => {
      callback();
    });
  }

  _destroy(e, callback) {
    if (e) {
      this._socket.emit('response-pipe-error', this._responseId, e && e.message);
      this._socket.io.engine.once('drain', () => {
        callback();
      });
      return;
    }
    callback();
  }

  writeHead(statusCode, statusMessage, headers, httpVersion) {
    this._socket.emit('response', this._responseId, {
      statusCode,
      statusMessage,
      headers,
      httpVersion,
    });
  }

  _read(size) {}
}

exports.SocketRequest = SocketRequest;
exports.SocketResponse = SocketResponse;
