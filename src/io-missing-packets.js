var ioMissingPackets = {
  // Variables for broadcast messages
  executedStore: [], // It contains all executed data by current user (at receiver side), used by ahead packets
  executedSerial: {},
  missRequest: [], // Status for Request for missed packets
  aheadPackets: [],
  missRequestFlag: 0, // Flag to show status of Miss Packet request

  // Variables for individual messages (usersend)
  executedUserStore: [],
  executedUserSerial: {},

  missUserRequest: [], // Status for Request for missed packets
  aheadUserPackets: [],


  missUserRequestFlag: 0, // Flag to show status of Miss Packet request
  // TODO - Store to IndexDB

  validateAllVariables(uid) {
    if (typeof this.executedSerial === 'undefined' || this.executedSerial == null) {
      this.executedSerial = {};
    }
    if (typeof this.executedSerial[uid] === 'undefined') {
      this.executedSerial[uid] = -1;
    }
    if (typeof this.missRequest[uid] === 'undefined') {
      this.missRequest[uid] = 0;
    }
    if (typeof this.executedStore[uid] === 'undefined') {
      this.executedStore[uid] = [];
    }
    if (typeof this.aheadPackets[uid] === 'undefined') {
      this.aheadPackets[uid] = [];
    }
  },
  validateAllUserVariables(uid) {
    if (typeof this.executedUserSerial === 'undefined' || this.executedUserSerial == null) {
      this.executedUserSerial = {};
    }
    if (typeof this.executedUserSerial[uid] === 'undefined') {
      this.executedUserSerial[uid] = -1;
    }
    if (typeof this.missUserRequest[uid] === 'undefined') {
      this.missUserRequest[uid] = 0;
    }
    if (typeof this.executedUserStore[uid] === 'undefined') {
      this.executedUserStore[uid] = [];
    }
    if (typeof this.aheadUserPackets[uid] === 'undefined') {
      this.aheadUserPackets[uid] = [];
    }
  },


  /**
   * 1) Check if packet is missed and request for missing packets
   * 2) If a request is already in queue, do not send more requests.
   * 3) Finally call, io.onRecJson function when queue is normal (all missing packets received).
   */
  async checkMissing(msg) {
    // debugger;
    if (virtualclass.isPlayMode) {
      io.onRecJson(msg);
      return;
    }

    const uid = msg.user.userid;
    this.validateAllVariables(uid);

    // we would think about sesion clear only when the request would come from teacher
    if (msg.user.role === 't' && Object.prototype.hasOwnProperty.call(msg.m, 'ping') && Object.prototype.hasOwnProperty.call(msg.m, 'session')) {
      const mySession = localStorage.getItem('mySession');
      if (mySession != null && msg.m.session !== mySession) {
        // TODO Finish Session and start gracefully
        if (!virtualclass.isPlayMode) {
          localStorage.removeItem('mySession');
          await virtualclass.config.endSession();
          virtualclass.config.setNewSession(msg.m.session);
          // console.log('REFRESH SESSION');
        } else {
          virtualclass.config.setNewSession('thisismyplaymode');
        }

        // console.log('Start session gracefully');
        return;
      }
    }

    if (msg.m.missedpackets === 1) {
      this.fillExecutedStore(msg);
    } else if (typeof msg.m.serial !== 'undefined' && msg.m.serial != null) {
      if ((msg.m.serial === (this.executedSerial[uid] + 1)) || msg.m.serial === 0) {
        // Everything is good and in order
        // console.log(`UID ${uid} Object with Serial ${msg.m.serial}`);
        this.executedSerial[uid] = msg.m.serial;
        this.executedStore[uid][msg.m.serial] = msg;
        ioStorage.storeCacheAllData(msg, [msg.user.userid, msg.m.serial]);
        io.onRecJson(msg);
      } else if (msg.m.serial > (this.executedSerial[uid] + 1)) {
        // console.log(`UID ${uid} requst miss packet`);
        // we should not need the request packet when self packet is recieved
        // if(msg.user.userid != virtualclass.gObj.uid){
        const from = this.executedSerial[uid] + 1;
        this.requestMissedPackets(from, msg.m.serial, msg, uid);
        // }
      } else { // We will not execute packets that has serial lesser then current packet but let us still store them
        // console.log(`UID ${uid} no action current packet ${this.executedSerial[uid]} coming at ${msg.m.serial}`);
        this.executedStore[uid][msg.m.serial] = msg;
      }
    } else {
      // console.log(`UID ${uid} checkMissing should not be called without serial`);
    }
  },

  /**
   * Only applicable for messages send individually to a user
   * 1) Check if packet is missed and request for missing packets
   * 2) If a request is already in queue, do not send more requests.
   * 3) Finally call, io.onRecJson function when queue is normal (all missing packets received).
   */
  userCheckMissing(msg) {
    const uid = msg.user.userid;
    this.validateAllUserVariables(uid);

    if (msg.m.missedpackets === 1) {
      this.fillExecutedStore(msg);
    } else if (typeof msg.m.userSerial !== 'undefined' && msg.m.userSerial != null) {
      if ((msg.m.userSerial === (this.executedUserSerial[uid] + 1)) || msg.m.userSerial === 0) {
        // Everything is good and in order
        // console.log(`UID ${uid} Object with userSerial ${msg.m.userSerial}`);
        this.executedUserSerial[uid] = msg.m.userSerial;
        io.onRecJson(msg);
        this.executedUserStore[uid][msg.m.userSerial] = msg;
        ioStorage.storeCacheInData(msg, [uid, msg.m.userSerial]);
      } else if (msg.m.userSerial > (this.executedUserSerial[uid] + 1)) {
        // console.log(`UID ${uid} requst miss packet`);
        const from = this.executedUserSerial[uid] + 1;
        this.userRequestMissedPackets(from, msg.m.userSerial, msg, uid);
      } else { // We will not execute packets that has userSerial lesser then current packet but let us still store them
        // console.log(`UID ${uid} no action current packet ${this.executedUserSerial[uid]} coming at ${msg.m.userSerial}`);
        this.executedUserStore[uid][msg.m.userSerial] = msg;
      }
    } else {
      // console.log(`UID ${uid} checkMissing should not be called without userSerial`);
    }
  },

  requestMissedPackets(from, till, msg, uid) {
    // debugger;
    if (from < 0) { // Make sure from is not negative
      from = 0;
    }

    'use strict';
    if (this.missRequest[uid] === 0) {
      // Save current packet
      this.aheadPackets[uid].unshift(msg.m.serial);
      this.executedStore[uid][msg.m.serial] = msg;
      till--; // We do not need to request current packet.
      // console.log(`UID ${uid} request packet from ${from} to ${till}`);
      this.waitAndResetmissRequest(uid);
      const sendMsg = {
        reqMissPac: 1,
        from,
        till,
      };
      // var tid = virtualclass.vutil.whoIsTeacher();
      ioAdapter.sendUser(sendMsg, uid);
    } else {
      // console.log(`UID ${uid} ahead packet${msg.m.serial}`);
      this.aheadPackets[uid].unshift(msg.m.serial);
      this.executedStore[uid][msg.m.serial] = msg;
    }
  },

  userRequestMissedPackets(from, till, msg, uid) {
    // debugger;
    if (from < 0) { // Make sure from is not negative
      from = 0;
    }

    'use strict';
    if (this.missUserRequest[uid] === 0) {
      // Save current packet
      this.aheadUserPackets[uid].unshift(msg.m.userSerial);
      this.executedUserStore[uid][msg.m.userSerial] = msg;
      till--; // We do not need to request current packet.
      // console.log(`UID ${uid} User request packet from ${from} to ${till}`);
      this.userWaitAndResetmissUserRequest(uid);
      const sendMsg = {
        userReqMissPac: 1,
        from,
        till,
      };
      // var tid = virtualclass.vutil.whoIsTeacher();
      ioAdapter.sendUser(sendMsg, uid);
    } else {
      // console.log(`UID ${uid} User ahead packet${msg.m.userSerial}`);
      this.aheadUserPackets[uid].unshift(msg.m.userSerial);
      this.executedUserStore[uid][msg.m.userSerial] = msg;
    }
  },


  /**
   * Set missRequest variable and Reset it after delay time so that another attempt could be made
   */
  waitAndResetmissRequest(uid) {
    ioMissingPackets.missRequest[uid] = 1;
    ioMissingPackets.missRequestFlag = 1;
    setTimeout(() => {
      ioMissingPackets.missRequest[uid] = 0;
      ioMissingPackets.missRequestFlag = 0;
    }, 15000);
  },

  /**
   * Set missUserRequest variable and Reset it after delay time so that another attempt could be made
   */
  userWaitAndResetmissUserRequest(uid) {
    ioMissingPackets.missUserRequest[uid] = 1;
    ioMissingPackets.missUserRequestFlag = 1;
    setTimeout(() => {
      ioMissingPackets.missUserRequest[uid] = 0;
      ioMissingPackets.missUserRequestFlag = 0;
    }, 15000);
  },

  sendMissedPackets(msg) {
    // debugger;


    const uid = msg.user.userid;
    this.validateAllVariables(uid);

    let { from } = msg.m;
    if (from < 0) { // Make sure from is not negative
      from = 0;
    }
    const till = msg.m.till + 1; // slice extracts up to but not including end.
    const senddata = ioAdapter.adapterMustData.slice(from, till);

    const sendmsg = {
      missedpackets: 1,
      data: senddata,
    };

    ioAdapter.sendUser(sendmsg, msg.user.userid); // to user
    // console.log(`UID ${uid} send packet total chunk length ${senddata.length}`);
  },

  userSendMissedPackets(msg) {
    // debugger;
    const uid = msg.user.userid;
    this.validateAllUserVariables(uid);

    let { from } = msg.m;
    if (from < 0) { // Make sure from is not negative
      from = 0;
    }
    const till = msg.m.till + 1; // slice extracts up to but not including end.
    const senddata = ioAdapter.userAdapterMustData[uid].slice(from, till);
    const sendmsg = {
      userMissedpackets: 1,
      data: senddata,
    };

    ioAdapter.sendUser(sendmsg, msg.user.userid); // Will avoid using 'Must' Send for 'Must' Send miss request
    // console.log(`UID ${uid} send packet total chunk length ${senddata.length}`);
  },

  /**
   * Fill ExecutedStore with missing packets and executed them one by one
   * If aheadPackets are available, process them
   * @param msg
   */

  fillExecutedStore(msg) {
    const uid = msg.user.userid;
    this.validateAllVariables(uid);

    const dataLength = msg.m.data.length;
    let i; let
      ex;
    for (i = 0; i < dataLength; i++) {
      if (msg.m.data[i] != null) {
        if (typeof msg.m.data[i].m.serial !== 'undefined' && msg.m.data[i].m.serial != null) {
          this.executedSerial[uid] = msg.m.data[i].m.serial;
          msg.m.data[i].user = msg.user;
          ioStorage.storeCacheAllData(msg.m.data[i], [uid, msg.m.data[i].m.serial]);
          this.executedStore[uid][msg.m.data[i].m.serial] = msg.m.data[i];
          try {
            // console.log(`UID ${uid} Object with Serial ${msg.m.data[i].m.serial}`);
            // console.log('====> missing packet ', i);
            io.onRecJson(msg.m.data[i]);
          } catch (error) {
            // console.log(`Error ${error}`);
          }
        } else {
          // console.log(`UID ${uid} Received Packed missing serial`);
        }
      }
    }

    this.aheadPackets[uid] = this.aheadPackets[uid].sort((a, b) => b - a); // Make sure packets are in correct order.

    while (ex = this.aheadPackets[uid].pop()) {
      if (typeof ex !== 'undefined' && ex != null) {
        if (typeof this.executedStore[uid][ex] !== 'undefined') {
          this.executedSerial[uid] = ex;
          // console.log(`UID ${uid} Object with Serial ${this.executedStore[uid][ex].m.serial}`);
          ioStorage.storeCacheAllData(this.executedStore[uid][ex], [uid, this.executedStore[uid][ex].m.serial]);
          io.onRecJson(this.executedStore[uid][ex]);
        } else {
          // console.log('fillExecutedStore undefined');
          return; //
        }
      } else {
        // console.log(`UID ${uid} ahead Packed missing serial`);
      }
    }
    this.missRequest[uid] = 0;
    ioMissingPackets.missRequestFlag = 0;
    virtualclass.vutil.initCommonSortingChat();
  },

  /**
   * Fill executedUserStore with missing packets and executed them one by one
   * If aheadUserPackets are available, process them
   * @param msg
   */

  userFillExecutedStore(msg) {
    const uid = msg.user.userid;
    this.validateAllUserVariables(uid);

    // console.log('received packet');
    if (msg.m.data.length > 0) {
      // console.log('UID ' + uid + ' received user packet from ' + msg.m.data[0].m.userSerial + ' to ' + msg.m.data[msg.m.data.length - 1].m.userSerial);
    } else {
      // console.log(`UID ${uid} empty user data object`);
    }

    const dataLength = msg.m.data.length;
    let i; let
      ex;
    for (i = 0; i < dataLength; i++) {
      if (msg.m.data[i] != null) {
        // the serial should not be null and undefined
        if (typeof msg.m.data[i].m.userSerial !== 'undefined' && msg.m.data[i].m.userSerial != null) {
          this.executedUserSerial[uid] = msg.m.data[i].m.userSerial;
          // ioStorage.dataExecutedUserStoreAll(msg.m.data[i], `${uid}_${msg.m.data[i].m.userSerial}`, msg.m.data[i].m.userSerial);
          msg.m.data[i].user = msg.user;
          msg.m.data[i].userto = msg.userto;
          ioStorage.storeCacheInData(msg.m.data[i], [uid, msg.m.data[i].m.userSerial]);
          try {
            // console.log(`UID ${uid} Object with user Serial ${msg.m.data[i].m.userSerial}`);
            io.onRecJson(msg.m.data[i]);
          } catch (error) {
            // console.log(`Error ${error}`);
          }
          this.executedUserStore[uid][msg.m.data[i].m.userSerial] = msg.m.data[i];
        } else {
          // console.log(`UID ${uid} Received Packed missing User serial`);
        }
      }
    }

    this.aheadUserPackets[uid] = this.aheadUserPackets[uid].sort((a, b) => b - a); // Make sure packets are in correct order.
    while (ex = this.aheadUserPackets[uid].pop()) {
      if (typeof ex !== 'undefined' && ex != null) {
        this.executedUserSerial[uid] = ex;
        // console.log(`UID ${uid} Object with Serial ${this.executedUserStore[uid][ex].m.userSerial}`);
        io.onRecJson(this.executedUserStore[uid][ex]);
      } else {
        // console.log(`UID ${uid} ahead Packed missing serial`);
      }
    }
    this.missUserRequest[uid] = 0;
    ioMissingPackets.missUserRequestFlag = 0;
    virtualclass.vutil.initCommonSortingChat();
  },
};
