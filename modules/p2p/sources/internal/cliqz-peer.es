import console from 'core/console';
import CliqzUtils from 'core/utils';
import crypto from 'platform/crypto';
import CliqzPeerConnection from './cliqz-peer-connection';
import constants from './constants';
import * as utils from './utils';
import { importPrivateKey, exportPublicKeySPKI, exportPrivateKeyPKCS8 } from './crypto';
import * as _messages from './messages';

const has = utils.has;
const InMessage = _messages.InMessage;
const OutMessage = _messages.OutMessage;
const decodeChunk = _messages.decodeChunk;
const decodeAck = _messages.decodeAck;
const subtle = crypto.subtle;

function _closeSocket(socket) {
  const _socket = socket;
  if (_socket) {
    try {
      _socket.onopen = null;
      _socket.onclose = null;
      _socket.onerror = null;
      _socket.onmessage = null;
      _socket.close();
    } catch (e) {
      // Nothing
    }
  }
}

/**
* A Peer that other peers can send/reiceive messages to/from, implemented with WebRTC.
* @constructor
* @memberOf module:global#

* @param {Object} window - A DOM window object, needed to have access to WebRTC functions.

* @param {(string|string[])} [peerID] - If it is a string, the peer will try to connect using that
* as peer ID. If it is an array, then it must be the value returned by the promise from
* {@link module:global#CliqzPeer.generateKeypair}.
* In this case, this RSA keypair will be used for authenticating with the signaling server, and the
* peerID will be derived from the public key.
* More concretely, the assigned peerID will be '_RSA_' + sha256(publicKey), but it is better
* practice to look at {@link module:global#CliqzPeer#peerID} when the
* call to {@link module:global#CliqzPeer#createConnection} resolves. Finally, if the parameter is
* undefined the peerID will be assigned a random id, which can
* be retrieved as in the previous case.

* @param {Object} [options] - CliqzPeer configuration options.
* @param {boolean} [options.DEBUG] Equivalent to setting {@link options.LOGLEVEL} to 'debug'
* @param {string} [options.LOGLEVEL] 'info' enables info logs message, 'debug' enables all logs.
* @param {string} [options.brokerUrl] WebSocket URI of the signaling server.
* @param {number} [options.chunkSize] Sent messages will be split in chunks of this size (bytes).
* Default should work fine, values of more than 9000-10000 bytes might not work.
* @param {Object} [options.peerOptions] Options object that will be passed to the the
* RTCPeerConnection constructor.
* For example, configuration for ICE servers is defined here. See
* {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection}.
* @param {number} [options.maxReconnections] Maximum number of tries when connecting to another
* peer.
* @param {number} [options.pingInterval] How often (in seconds) the connections with other peers
* health will be checked (if a connection is not healthy, it will be closed).
* If 0, no checks will be automatically done.
*/
export default class CliqzPeer {
  constructor(window, peerID, options) {
    const _options = options || {};
    this.window = window;
    this.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
    this.RTCPeerConnection =
      window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    this.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
    this.WebSocket = window.WebSocket;
    if (_options.DEBUG) {
      this.log = this.logDebug = console.log.bind(console);
    } else if (_options.LOGLEVEL) {
      if (_options.LOGLEVEL === 'info') {
        this.logDebug = () => {};
        this.log = console.log.bind(console);
      } else if (_options.LOGLEVEL === 'debug') {
        this.log = this.logDebug = console.log.bind(console);
      } else {
        this.log = this.logDebug = () => {};
      }
    } else {
      this.log = this.logDebug = () => {};
    }
    this.setTimeout = CliqzUtils.setTimeout.bind(CliqzUtils);
    this.clearTimeout = CliqzUtils.clearTimeout.bind(CliqzUtils);
    this.setInterval = CliqzUtils.setInterval.bind(CliqzUtils);
    this.clearInterval = CliqzUtils.clearInterval.bind(CliqzUtils);
    /**
     * Our identifier, to be used by other peers to connect to us.
     * @type {String}
     */
    this.peerID = null;
    if (Array.isArray(peerID)) { // This means it is a keypair
      this.publicKey = peerID[0];
      this.privateKey = peerID[1];
    } else if (typeof peerID === 'string') {
      if (peerID.length < 64) {
        this.peerID = peerID;
      } else {
        throw new Error('peerID must be less then 64 chars');
      }
    }

    this.brokerUrl = has(_options, 'brokerUrl') ? _options.brokerUrl : 'wss://p2p-signaling.cliqz.com';
    this.chunkSize = has(_options, 'chunkSize') ? _options.chunkSize : 9000;
    this.peerOptions = has(_options, 'peerOptions') ? _options.peerOptions : {
      iceServers: [
        {
          urls: ['turn:p2p-turn.cliqz.com:3478'],
          username: 'cliqz',
          credential: 'JvfTRrV-VHLtOm2_',
        },
      ],
    };
    this.maxReconnections = has(_options, 'maxReconnections') ? _options.maxReconnections : 3;
    this.maxSocketConnectionTime = has(_options, 'maxSocketConnectionTime') ?
      _options.maxSocketConnectionTime : 5;
    this.lastSocketTime = 0;
    this.pingInterval = Math.round(has(_options, 'pingInterval') ? _options.pingInterval : 0);
    this.maxMessageRetries = has(_options, 'maxMessageRetries') ? _options.maxMessageRetries : 1;
    this.ordered = has(_options, 'ordered') ? _options.ordered : false;
    this._setInitialState();

    this.outMessages = {};
    this.inMessages = {};

    this.resetStats();
    const signalingEnabled = has(_options, 'signalingEnabled') ? _options.signalingEnabled : true;
    this.signalingEnabled = false;
    if (signalingEnabled) {
      this.enableSignaling();
    }
  }

  /**
   * @typedef module:global#CliqzPeer~ConnErrorDistribution
   * @type Object
   *
   * @property {number} notconnectedsignaling Not able to communicate with signaling server.
   * @property {number} noroute Other peer was not conected to signaling server.
   * @property {number} noconnectivity Not able to connect after exchanging signaling messages.
   */

  /**
   * @typedef module:global#CliqzPeer~CandidatesDistribution
   * @type Object
   *
   * @property {number} host
   * @property {number} peerreflexive
   * @property {number} serverreflexive
   * @property {number} relayed
   */

  /**
   * @typedef module:global#CliqzPeer~Stats
   * @type Object
   * @property {number} outconn Number of successful outgoing (created by this peer) connections
   * @property {number} inconn Number of successful incoming connections
   * @property {module:global#CliqzPeer~ConnErrorDistribution} inconnerror Distribution of errors
   * for incoming connections
   * @property {module:global#CliqzPeer~ConnErrorDistribution} outconnerror Distribution of errors
   * for outcoming connections
   * @property {module:global#CliqzPeer~CandidatesDistribution} localcandidatedist Distribution of
   * selected local candidates
   * @property {module:global#CliqzPeer~CandidatesDistribution} remotecandidatedist Distribution of
   * selected remote candidates
   * @property {number} outtotalbytes Number of bytes tried to be sent (acknowledged or not)
   * @property {number} outbytes Number of bytes correctly sent (acknowledged)
   * @property {number} inbytes Number of bytes received
   * @property {number} outmsgs Msgs sent and acknowledged
   * @property {number} outtotalmsgs Number of msgs tried to be sent (successful or not)
   * @property {number} inmsgs Msgs received
   * @property {number} distinctpeers Number of distinct peers we have connected to
   * @property {number} relayedconn Number of connections that were relayed (remote or local
   * candidate were relay)
   * @property {number} signalingtime Time connected to signaling server (seconds)
   * @property {number} signalingfailedconn Number of failed connections to signaling server
   * @property {number} signalingconn Number of good connections to signaling server
   * @property {number} totaltime Total time since the stats started to be collected (seconds)
   * @property {string} useragent User agent string
   * @property {number} timestamp Timestamp in seconds of the moment stats were retrieved
   * @property {string} version Version number
   */

  /**
   * Returns statistics object.
   * @return {module:global#CliqzPeer~Stats}
   *
  */
  getStats() {
    const stats = JSON.parse(JSON.stringify(this.stats));
    if (stats._lastsignalingtime) {
      stats.signalingtime += Math.floor((Date.now() - stats._lastsignalingtime) / 1000);
    }
    stats.totaltime = Math.floor((Date.now() - stats._timestart) / 1000);
    Object.keys(stats).forEach((key) => {
      if (key[0] === '_') {
        delete stats[key];
      }
    });
    stats.useragent = this.window.navigator ? this.window.navigator.userAgent : null;
    stats.version = '0.1';
    stats.timestamp = Math.floor(Date.now() / 1000);
    return stats;
  }

  resetStats() {
    this.stats = {
      outconn: 0, // Number of successful outgoing (created by this peer) connections
      inconn: 0, // Number of successful incoming connections
      inconnerror: { // Distribution of incoming connection errors by reason
        notconnectedsignaling: 0,
        noroute: 0,
        noconnectivity: 0,
      },
      outconnerror: { // Distribution of outgoing connection errors by reason
        notconnectedsignaling: 0,
        noroute: 0,
        noconnectivity: 0,
      },
      localcandidatedist: {
        host: 0,
        peerreflexive: 0,
        serverreflexive: 0,
        relayed: 0,
      }, // Distribution of selected local candidates
      remotecandidatedist: {
        host: 0,
        peerreflexive: 0,
        serverreflexive: 0,
        relayed: 0,
      }, // Distribution of selected remote candidates
      outtotalbytes: 0, // Number of bytes tried to be sent (acknowledged or not)
      outbytes: 0, // Number of bytes correctly sent (acknowledged)
      inbytes: 0, // Number of bytes received
      outmsgs: 0, // msgs sent and acknowledged
      outtotalmsgs: 0, // Number of msgs tried to be sent (successful or not)
      inmsgs: 0, // msgs received

      _peers: {}, // Needed to keep a count of distinct peers connected to
      distinctpeers: 0, // Number of distinct peers we have connected to
      relayedconn: 0, // Number of connections that were relayed
                      // (remote or local candidate were relay)
      signalingtime: 0, // Time connected to signaling server
      signalingfailedconn: 0, // Number of failed connections to signaling server
      signalingconn: 0, // Number of good connections to signaling server
      socketconntime: 0,
      _lastsignalingtime: null, // Time of the last good connection to signaling server
      _timestart: Date.now(), // Time when these stats started to be collected
      signalingMessages: 0,
    };
  }

  applySignalingMessage(data) {
    const message = data.data;
    const type = message.type;
    const from = data.from;
    const id = data.id;

    if (this.peerWhitelist && !has(this.peerWhitelist, from)) {
      this.log('Dropping signaling message from peer not in whitelist:', from);
      return;
    }
    if (type === 'ice') { // Receive ICE candidates
      const candidate = JSON.parse(message.candidate);
      if (candidate) {
        const conn = this._getPendingConnection(from);
        if (!conn) {
          this.log('WARNING: setting ICE candidates for unexisting pending connection');
        } else if (conn.status === 'initial' || conn.status === 'signaling') {
          conn.status = 'signaling';
          if (conn.connection.signalingState !== 'have-remote-offer' && conn.connection.signalingState !== 'stable') {
            this.log(conn.connection.iceConnectionState, conn.connection.signalingState, 'ERROR: setting ICE candidates with signalingState != have-remote-offer');
          } else {
            conn.receiveICECandidate(candidate, id);
          }
        } else {
          this.log('Received ICE for connection with status', conn.status);
        }
      }
    } else if (type === 'offer') { // Receive offer description
      let conn = this._createConnection(from, false);
      if (!conn) {
        // Connection already exists: we need to handle the case where both peers want
        // to initiate the connection with each other at the same time. Solution: the peer
        // with biggest ID wins.
        conn = this._getPendingConnection(from);
        if (!conn.isLocal || from > this.peerID) {
          this.log('INFO: connection collision -> I lose', this.peerID);
          conn.close(true); // Close without propagating onclose event
          delete this.pendingConnections[from];
          this.connectionRetries[from] = 0;
          conn = this._createConnection(from, false); // Replace with new non-local connection
        } else {
          this.log('INFO: connection collision -> I win', this.peerID);
          conn = null;
        }
      }
      if (conn) {
        if (conn.status === 'initial' || conn.status === 'signaling') {
          conn.status = 'signaling';
          conn.receiveOffer(message, id);
        } else {
          this.log('Received offer for connection with status', conn.status);
        }
      }
    } else if (type === 'answer') {
      const conn = this._getPendingConnection(from);
      if (!conn) {
        this.log('ERROR: received answer for unexisting pending connection');
      } else if (conn.status === 'initial' || conn.status === 'signaling') {
        conn.status = 'signaling';
        conn.receiveAnswer(message, id);
      } else {
        this.log('Received answer for connection with status', conn.status);
      }
    } else {
      this.log(message, 'Unknown message');
    }
  }

  enableSignaling() {
    if (!this.signalingEnabled) {
      this.signalingEnabled = true;
      this._createSocket();
      this.signalingConnector = this.setInterval(() => {
        this.signalingConnectorTicks = (this.signalingConnectorTicks || 0) + 1;
        if (!this.socket && this.signalingConnectorTicks > Math.min(60, this.socketRetrials)) {
          this.signalingConnectorTicks = 0;
          this._createSocket();
        }
      }, 1000);
    }
  }

  disableSignaling() {
    if (this.signalingEnabled) {
      this.signalingEnabled = false;
      this.clearInterval(this.signalingConnector);
      this.signalingConnector = null;
      this.closeSocket();
    }
  }

  /**
  * Returns whether the given peerID is authenticated or not (user-set,
  * randomly generated by signaling server)
  */
  static isPeerAuthenticated(peerID) {
    return peerID && typeof peerID === 'string' && peerID.length === 64;
  }

  /**
  * Converts a given privateKey (base64 encoded, PKCS#1 format) to the
  * same keypair format returned by the promise of {@link module:global#CliqzPeer.generateKeypair}.
  */
  static privateKeytoKeypair(privateKey) {
    const key = importPrivateKey(privateKey);
    return [exportPublicKeySPKI(key), exportPrivateKeyPKCS8(key)];
  }

  /**
  * Returns a promise which will resolve to an array with two strings: [publicKey, privateKey],
  * which can easily be persisted. This can be used as an alternative to
  * a string PeerID in {@link module:global#CliqzPeer},
  * to get a fixed peerID but making sure that no one else can get it. Keys will be RSA keys,
  * base64 encoded: publicKey in 'spki' format and private key in 'pkcs8', as defined in WebCrypto
  */
  static generateKeypair() {
    return subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: { name: 'SHA-256' },
      },
          true,
          ['sign', 'verify'],
      )
      .then(key => Promise.all([
        subtle.exportKey(
                  'spki',
                  key.publicKey,
              )
              .then(keydata => utils.base64_encode(keydata)),
        subtle.exportKey(
                  'pkcs8',
                  key.privateKey,
              )
              .then(keydata => utils.base64_encode(keydata)),
      ]));
  }

  _setInitialState() {
    // Status of the connection to the signaling server
    this.connectionStatus = null;

    // Promises to be resolved when the connection to signaling server is established
    this.openPromises = [];

    // Promises (indexed by peer id) to be resolved when a data connection to that peer is opened
    this.connectionPromises = {};

    // Number of unsuccessful consecutive retries to a peer (indexed by peer id)
    this.connectionRetries = {};

    // Maps peer id -> CliqzPeerConnection if an open connection to that peer exists
    this.connections = {};

    // Maps peer id -> CliqzPeerConnection if there is a connection to that peer which is being
    // negotiated (not yet open)
    this.pendingConnections = {};

    // Functions to be called when a message is received (deprecated)
    this.messageListeners = [];
      /**
        @callback module:global#CliqzPeer~onMessageCallback
        @param {?(number|string|boolean|Object|ArrayBuffer)} data - The data which was passed to
          {@link module:global#CliqzPeer#send} of the sending peer.
        @param {string} [label] - Label as specified in {@link module:global#CliqzPeer#send}.
        @param {string} peerID - The sender peerID.
       */
      /**
       * Function which will be called whenever a message from other peer is received.
       * @type {module:global#CliqzPeer~onMessageCallback}
       */
    this.onmessage = null; // Function to be called when a message is received
      /**
        @callback module:global#CliqzPeer~onConnectCallback
        @param {string} peerID - The other peerID.
       */
      /**
       * Function which will be called whenever a new connection with a peer is created.
       * @type {module:global#CliqzPeer~onConnectCallback}
       */
    this.onconnect = null; // Function to be called when a new connection with a peer is created
      /**
        @callback module:global#CliqzPeer~onDisconnectCallback
        @param {string} peerID - The other peerID.
       */
      /**
       * Function which will be called whenever a new connection with a peer is closed.
       * @type {module:global#CliqzPeer~onDisconnectCallback}
       */
    this.ondisconnect = null; // Function to be called when a connection with a peer is closed
    this.socketRetrials = 0; // Number of unsuccessful consecutive reconnections to signaling server
    // Used for storing the chunks of the partially received messages (indexed by message id)
    this.pendingMessages = {};
    this.socket = null; // WebSocket connection to the signaling server
    this.peerWhitelist = null; // Whitelist of allowed peers, enforced if !== null
    this.messageSizeLimit = 0; // Will drop messages larger than this message size, if it is > 0
  }

  /**
  * Destroys peer. This means closing connection with signaling server and other peers, and that
    the peer instance cannot be used anymore.
  */
  destroy() {
    if (!this.destroyed) {
      this.clearInterval(this.signalingConnector);
      this.signalingConnector = null;
      this.destroyed = true;
      Object.keys(this.connections).forEach((key) => {
        const conn = this.connections[key];
        if (conn) {
          conn.close();
        }
      });
      Object.keys(this.pendingConnections).forEach((key) => {
        const conn = this.pendingConnections[key];
        if (conn) {
          conn.close();
        }
      });
      Object.keys(this.outMessages).forEach((key) => {
        this.outMessages[key].kill(true); // Close with success..
      });
      Object.keys(this.inMessages).forEach((key) => {
        this.inMessages[key].kill(true); // Close with success
      });
      this.closeSocket();
      this._setInitialState();
    }
  }

  /**
  * Starts connection with signaling server.
  */
  createConnection() {
    if (this.connectionStatus === 'routed') {
      return Promise.resolve();
    }
    if (!this.signalingEnabled) {
      return Promise.reject(new Error('Signaling not enabled'));
    }
    return new Promise((resolve, reject) => {
      this.openPromises.push([resolve, reject]);
      this._createSocket();
    });
  }

  _createSocket() {
    if (!this.socket && this.signalingEnabled) {
      if (!this.lastSocketTime) {
        this.lastSocketTime = Date.now();
      }
          // TODO: add socket killer with timeout
      try {
        const socket = new this.WebSocket(this.brokerUrl);
        this.socketKiller = this.setTimeout(() => {
          if (this.socket === socket) {
            this.closeSocket();
          } else {
            _closeSocket(socket);
          }
        }, 5000); // TODO: make configurable
        this.socket = socket;
        this.socket.onopen = () => {
          if (this.socket === socket) {
            this._onSocketOpen();
          } else {
            this.log('ERROR: received onopen message from old socket');
            _closeSocket(socket);
          }
        };
        this.socket.onclose = () => {
          if (this.socket === socket) {
            this._onSocketClose();
          } else {
            this.log('ERROR: received onclose message from old socket');
            _closeSocket(socket);
          }
        };
        this.socket.onerror = (error) => {
          if (this.socket === socket) {
            this._onSocketError(error);
          } else {
            this.log('ERROR: received onerror message from old socket');
            _closeSocket(socket);
          }
        };
        this.socket.onmessage = (event) => {
          if (this.socket === socket) {
            this._onSocketMessage(event);
          } else {
            this.log('ERROR: received onmessage message from old socket');
            _closeSocket(socket);
          }
        };
      } catch (e) {
        this.log('ERROR in _createSocket:', e);
      }
    }
  }

  closeSocket() {
    if (this.socket) {
      if (this.socketKiller) {
        this.clearTimeout(this.socketKiller);
        this.socketKiller = null;
      }
      _closeSocket(this.socket);
      this._onSocketClose();
    }
  }

  addMessageListener(cb) {
    this.log('DEPRECATED: addMessageListener, setting peer.onmessage = listener is prefered');
    this.messageListeners.push(cb);
  }

  /**
  * Returns a promise that will resolve if we can send data to the peer, and reject otherwise.
  * As a side effect it will close a cached connection with the peer if the check was unsuccessful.
  * @param {string} peerID - The other peerID.
  */
  checkPeerConnection(peer) {
    return this.connectPeer(peer)
      .then(() => this._getConnection(peer).healthCheck())
      // Try to reconnect once, for the cases the connection was stale
      .catch(() => this.connectPeer(peer));
  }

  /**
  * Returns a promise that will resolve if a connection with the specified peer already exists
  * (is cached) or if the attempt of creating a new one (and caching it)
  * succeeds. It is not required to call this function before calling
  * {@link module:global#CliqzPeer#send}, it will be called internally when required.
  *
  * If the goal is to check whether a healthy connection with the peer can be established or used,
  * {@link module:global#CliqzPeer#checkPeerConnection} should be used, since connectPeer might
  * resolve with cached connections that
  * were not gracefully closed by the other side and are therefore 'dead'.
  * @param {string} peerID - The other peerID.
  */
  connectPeer(requestedPeer) {
    if (has(this.connections, requestedPeer)) {
      return Promise.resolve();
    }
    // TODO: do we need to wait to create signaling connection?
    return Promise.resolve().then(() => (this.signalingEnabled ? this.createConnection() : null))
    .then(() => new Promise((resolve, reject) => {
      this.log('Trying to connect to peer', requestedPeer);
      if (!has(this.connectionPromises, requestedPeer)) {
        this.connectionPromises[requestedPeer] = [];
      }
      this.connectionPromises[requestedPeer].push([resolve, reject]);
      if (!has(this.pendingConnections, requestedPeer)) {
        this._createConnection(requestedPeer, true);
      }
    }));
  }
  sendStringMsg(peer, msg, label) {
    this.log('DEPRECATED: sendStringMsg, send is prefered');
    return this.send(peer, msg, label);
  }

  sendMsg(peer, msg, label) {
    this.log('DEPRECATED: sendMsg, send is prefered');
    return this.send(peer, msg, label);
  }

  /**
  * Send a message to another peer.
    @param {?(number|string|boolean|Object|ArrayBuffer|ArrayBufferView)} data - The data to be
    sent. It will be received from the other side in the
    {@link module:global#CliqzPeer#onmessage} callback, exactly as passed here except in the
    case of ArrayBufferView, which will be received as ArrayBuffer.
    @param {string} [label] - Label as specified in {@link module:global#CliqzPeer#send}.
    @param {string} peerID - The target peerID.
  */
  send(peer, msg, label) {
    if (msg === undefined) {
      return Promise.reject('undefined is not a valid message: use null instead');
    }
    this.stats.outtotalmsgs += 1;
    return this.connectPeer(peer)
      .then(() => new Promise((resolve, reject) => {
        const outMsg = new OutMessage(msg, label, peer, resolve, reject, this);
        outMsg.send();
      }));
  }

  /**
  * Disables 'trusted peer' mode and removes all trusted peers, so no more sender checks will be
    done.
  */
  clearPeerWhitelist() {
    this.peerWhitelist = null;
  }

  /**
  * When called for the first time, it will enable 'trusted peer' mode, in which only messages
  * sent by the peers added through this function will be accepted.
  * @param {string} peerID - The trusted peerID to be added.
  */
  addTrustedPeer(peerID) {
    if (!this.peerWhitelist) {
      this.peerWhitelist = {};
      Object.keys(this.connections).forEach((peer) => {
        if (peer !== peerID) {
          this.connections[peer].close();
        }
      });
    }
    this.peerWhitelist[peerID] = true;
  }

  /**
  * Remove a trusted peer. Warning: will not disable 'trusted peer' mode, for that use
  * {@link module:global#CliqzPeer#clearPeerWhitelist}.
  * @param {string} peerID - The trusted peerID to be removed.
  */
  removeTrustedPeer(peerID) {
    if (has(this.peerWhitelist, peerID)) {
      if (this.connections[peerID]) {
        this.connections[peerID].close();
      }
      delete this.peerWhitelist[peerID];
    }
  }

  /**
  * Set message size limit (bytes): all messages greater than this size will be dropped.
  * @param {number} maxBytes - Maximum message size in bytes. If 0, no checks will be done.
  */
  setMessageSizeLimit(maxBytes) {
    this.messageSizeLimit = maxBytes;
  }


  /**
  * Disables messages size checks.
  */
  clearMessageSizeLimit() {
    this.messageSizeLimit = 0;
  }

  // CliqzPeer private methods

  _createConnection(peer, isLocal) {
    if (!has(this.pendingConnections, peer)) {
      this.logDebug('creating connection', peer);
      const connection = this.pendingConnections[peer] =
        new CliqzPeerConnection(this, this.peerOptions, peer, isLocal);
      if (isLocal) {
        connection.createOffer();
      }
      connection.onopen = () => {
        this.log('Connected to', peer);
        if (has(this.connections, peer)) {
          this.connections[peer].close();
        }
        this.connections[peer] = this.pendingConnections[peer];
        delete this.pendingConnections[peer];
        this.connectionRetries[peer] = 0;
        const promises = has(this.connectionPromises, peer) ? this.connectionPromises[peer] : [];
        promises.splice(0, promises.length).forEach(p => p[0]()); // Resolve
        if (this.onconnect) {
          this.onconnect(peer);
        }
        if (this.peerWhitelist && !has(this.peerWhitelist, peer)) {
          this.log('ERROR: Closing connection with peer not in whitelist:', peer);
          this.connections[peer].close();
        }
        if (isLocal) {
          this.stats.outconn += 1;
        } else {
          this.stats.inconn += 1;
        }
        connection.getCandidatesInfo()
        .then((x) => {
          this.stats.localcandidatedist[x.localCandidateType] =
            (this.stats.localcandidatedist[x.localCandidateType] || 0) + 1;

          this.stats.remotecandidatedist[x.remoteCandidateType] =
            (this.stats.remotecandidatedist[x.remoteCandidateType] || 0) + 1;
        })
        .catch(() => {
          this.log('Could not retrieve candidates info');
        });
        connection.isRelayed().then((isRelayed) => {
          if (isRelayed) {
            this.stats.relayedconn += 1;
          }
        });
        // TODO: this is a potential memory leak
        if (!has(this.stats._peers, peer)) {
          this.stats._peers[peer] = true;
          this.stats.distinctpeers += 1;
        }
      };
      connection.onclose = (status) => {
        this.logDebug(`connection with ${peer} closed`, status);
        const promises = has(this.connectionPromises, peer) ? this.connectionPromises[peer] : [];
        if (connection === this.pendingConnections[peer]) {
          delete this.pendingConnections[peer];
          this.connectionRetries[peer] = (this.connectionRetries[peer] || 0) + 1;
          if (this.connectionRetries[peer] >= this.maxReconnections) {
            this.connectionRetries[peer] = 0;
            if (status === 'initial') {
              if (isLocal) {
                this.stats.outconnerror.notconnectedsignaling += 1;
              } else {
                this.stats.inconnerror.notconnectedsignaling += 1;
              }
            } else if (status === 'nosuchroute') {
              if (isLocal) {
                this.stats.outconnerror.noroute += 1;
              } else {
                this.stats.inconnerror.noroute += 1;
              }
            } else if (status === 'signaling') {
              if (isLocal) {
                this.stats.outconnerror.noconnectivity += 1;
              } else {
                this.stats.inconnerror.noconnectivity += 1;
              }
            }
            promises.splice(0, promises.length).forEach(p => p[1](`could not connect to ${peer}`)); // Reject...
          } else if (isLocal) {
            this._createConnection(peer, true);
          }
        } else if (connection === this.connections[peer]) {
          delete this.connections[peer];
          if (promises.length > 0) {
            this.log('Connection promises should be empty here!', 'ERROR');
          }
          if (this.ondisconnect) {
            this.ondisconnect(peer);
          }
        } else {
          this.log('WARNING: closed connection is not stored in CliqzPeer.connections or CliqzPeer.pendingConnections');
        }
      };
      connection.onmessage = (message) => {
        if (utils.isArrayBuffer(message)) {
          const _message = new Uint8Array(message);
          const type = _message[0];
          if (type === constants.CHUNKED_MSG_TYPE) {
            try {
              const chunk = decodeChunk(_message.buffer);
              const msgId = chunk.msgId;
              if (!has(this.inMessages, msgId)) {
                /* eslint-disable no-new */
                // TODO: remove these side effects...
                new InMessage(chunk, peer, (data, label) => {
                  const listeners = this.messageListeners.concat(this.onmessage || []);
                  listeners.forEach((cb) => {
                    try {
                      cb(data, label, peer, connection);
                    } catch (e) {
                      this.log(typeof e === 'string' ? e : e.message, 'Error in cb onmessage');
                    }
                  });
                }, this);
              } else {
                this.inMessages[msgId].receivedChunk(chunk);
              }
            } catch (e) {
              this.log(typeof e === 'string' ? e : e.message, 'error calling cliqzpeerconnection onmessage');
            }
          } else if (type === constants.ACK_MSG_TYPE) {
            const ack = decodeAck(_message.buffer);
            const msgId = ack.msgId;
            const chunkId = ack.chunkId;
            const msg = this.outMessages[msgId];
            if (msg) {
              msg.receivedAck(chunkId);
            } else {
              this.log('Warning: received ack for unknown message', msgId);
            }
          } else if (type === constants.PING_MSG_TYPE) {
            connection.send(new Uint8Array([constants.PONG_MSG_TYPE]));
          } else if (type === constants.PONG_MSG_TYPE) {
            // Connection is alive, for the moment
            const promises = connection.pongPromises.splice(0, connection.pongPromises.length);
            promises.forEach((cb) => {
              try {
                cb();
              } catch (e) {
                this.log(typeof e === 'string' ? e : e.message, 'error in pong promise');
              }
            });
          } else {
            this.log('ERROR: unknown message type', type);
          }
        } else {
          this.log('Message', message, 'received, only processing ArrayBuffer messages');
        }
      };
      return connection;
    }
    this.log(`already connecting to ${peer}`);
    return null;
  }

  _getPendingConnection(peer) {
    if (has(this.pendingConnections, peer)) {
      return this.pendingConnections[peer];
    }
    return null;
  }

  _getConnection(peer) {
    if (has(this.connections, peer)) {
      return this.connections[peer];
    }
    return null;
  }

  // Here we handle messages from signaling server
  _onSocketMessage(event) {
    this.stats.signalingMessages += 1;
    const data = JSON.parse(event.data);
    if (data.type === 'challenge') {
      if (this.privateKey) {
        subtle.importKey(
          'pkcs8', // can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
          utils.base64_decode(this.privateKey),
          {   // these are the algorithm options
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: 'SHA-256' }, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
          },
          false, // whether the key is extractable (i.e. can be used in exportKey)
          ['sign'], // "verify" for public key import, "sign" for private key imports
        )
        .then(privateKey => subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, utils.strToUTF8Arr(data.data).buffer))
        .then(signature => this._sendSocket('connect', { authLogin: true, publicKey: this.publicKey, signature: utils.hex_encode(signature) }))
        .catch(e => this.log(e));
      } else {
        this.stats.signalingfailedconn += 1;
        this.closeSocket(); // Should destroy?
        this.log('Challenged by the signaling server but do not have private key');
      }
    } else if (data.type === 'route') { // Signaling server has sent us the route (peerID): we can consider the 'signaling connection' is open (routed) now
      const route = data.data;
      if (route) {
        this.peerID = route;
        this.connectionStatus = 'routed';
        this.clearTimeout(this.socketKiller);
        this.socketKiller = null;
        this.lastSocketTime = 0;
        this.socketRetrials = 0;
        this.stats._lastsignalingtime = Date.now();
        this.stats.signalingconn += 1;
        this.stats.socketconntime += Date.now() - this._lastSocketTime;
        this.openPromises.splice(0, this.openPromises.length).forEach((p) => {
          try {
            p[0](); // Resolve
          } catch (e) {
            this.log(e);
          }
        });
      } else {
        this.stats.signalingfailedconn += 1;
        this.closeSocket();
        this.log('Already existing route');
      }
    } else if (data.type === 'receive') {
      this.applySignalingMessage(data.data);
    } else if (data.type === 'send_response') {
      const from = data.data.from;
      const id = data.data.id;
      if (data.data.error === 'no such route') {
        const conn = this._getPendingConnection(from);
        if (conn) {
          conn.noSuchRoute(id);
        } else {
          this.logDebug(data, `received no_such_route_error for unexisting pending connection with ${from}`);
        }
      } else {
        this.log(data, 'unknown send_response');
      }
    } else {
      this.log('Unhandled message type: %s', data.type);
    }
  }

  _onSocketError(error) {
    this.log('socket.onerror', error);
    this.stats.signalingfailedconn += 1;
    this.closeSocket();
  }

  _onSocketClose() {
    if (this.socket) {
      this.log('socket.onclose');
      this.socket = this.connectionStatus = null;
      if (this.stats._lastsignalingtime) {
        this.stats.signalingtime += Math.floor((Date.now() - this.stats._lastsignalingtime) / 1000);
        this.stats._lastsignalingtime = null;
      }

      if (
        this.lastSocketTime &&
        (Date.now() - this.lastSocketTime) / 1000 >= this.maxSocketConnectionTime
      ) {
        this.lastSocketTime = Date.now();
        // Reject promises if we have been trying to connect for too long, but keep trying...
        this.openPromises.splice(0, this.openPromises.length).forEach((p) => {
          try {
            p[1](); // Reject
          } catch (e) {
            this.log(e);
          }
        });
      }
      this.socketRetrials += 1;
    }
  }

  _onSocketOpen() {
    this.log('socket.onopen');
    this.connectionStatus = 'open';
    if (this.privateKey) {
      this._sendSocket('connect', { authLogin: true });
    } else {
      this._sendSocket('connect', { route: this.peerID });
    }
  }

  _sendSocket(type, data) {
    if (this.connectionStatus === 'open' || this.connectionStatus === 'routed') {
      try {
        this.socket.send(JSON.stringify({ type, data }));
      } catch (e) {
        this.log('Error in sending socket, closing it...', e);
        this.closeSocket();
      }
    } else {
      this.log('Trying to send data through closed socket');
    }
  }

  _sendSignaling(to, data, id) {
    if (this.onsignaling) {
      this.onsignaling(to, { data, id, from: this.peerID });
    }
    if (this.signalingEnabled) {
      this._sendSocket('send', {
        to,
        data,
        id,
      });
    }
  }
}