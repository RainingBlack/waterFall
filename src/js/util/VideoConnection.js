/**
 * Created by haoweirui on 2017/7/20.
 * 视频连接器
 */
import Janus from "./janus.js";
import EventEmitter from "./EventEmitter.js";
import Const from "./Const.js";

class VideoConnection extends EventEmitter{

    constructor(){
        super();
        
        this.janus = null;

        this.pluginHandle = null;

        this.sid = "room_123";
        this.uid = "user008";
    }

    connectVideo(){
        Janus.init({debug: "all", callback: this.callback.bind(this)});
    }

    callback(){
        if(!Janus.isWebrtcSupported()) {
            alert("No WebRTC support... ");
            return;
        }

        this.janus = new Janus({
            server:"http://172.16.16.17:9088/janus",
            success:this.success.bind(this),
            error:this.error.bind(this),
            destroyed:this.destroyed.bind(this)
        });
    }

    success(){
        let self = this;
        this.janus.attach({
            plugin: "janus.plugin.blitz",
            opaqueId:"recordplaytest-"+Janus.randomString(12),
            success:function(pluginHandle){
                Janus.log("Plugin attached! (" + pluginHandle.getPlugin() + ", id=" + pluginHandle.getId() + ")");
                self.pluginHandle = pluginHandle;
                pluginHandle.send({
                    'message': {
                        'request': 'join',
                        'sid': self.sid,
                        'uid': self.uid,
                        'pwd': "d10dc677-e832-4c64-8fc5-b0afb1d50bdf"
                    }
                });
            },
            error: function(error) {
                Janus.error("  -- Error attaching plugin...", error);
            },
            consentDialog: function(on) {
                Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
            },
            webrtcState: function(on) {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            onmessage: function(msg, jsep) {
                Janus.log(" ::: Got a message :::",msg);
                switch(msg.result.status){
                    case "joined":
                        self.pluginHandle.createAnswer(
                            {
                                assrc : msg.assrc,
                                vssrc: msg.vssrc,
                                jsep: jsep,
                                success: function(jsep) {
                                    Janus.log("Got SDP!");
                                    Janus.log(jsep);
                                    let body = { "request": "record", "name": self.uid};
                                    self.pluginHandle.send({"message": body, "jsep": jsep});
                                },
                                error: function(error) {
                                    Janus.error("WebRTC error...", error);
                                    self.pluginHandle.hangup();
                                }
                            }
                        );
                        break;

                    case "playing":
                        Janus.log("Playout has started!");
                        break;

                    case "stopped":
                        Janus.log("Session has stopped!",result);
                        break;
                }
            },
            onlocalstream: function(stream) {
                Janus.log(" ::: Got a local stream :::");
                Janus.log(JSON.stringify(stream));
                self.emit(Const.EVENT_ADDSTREAM,stream);
            },
            onremotestream: function(stream) {
                Janus.log(" ::: Got a remote stream :::");
                Janus.log(JSON.stringify(stream));
                self.emit(Const.EVENT_ADDSTREAM,stream);
                
                stream.oninactive = function() {
                    //TODO
                }
                stream.onactive = function() {
                    //TODO
                }

                stream.onaddtrack = function() {
                    //TODO
                }

                stream.onremovetrack = function() {
                    console.error("onremovetrack",stream);
                    self.emit(Const.EVENT_REMOVESTREAM,stream);
                }
            },
            oncleanup: function() {
                Janus.log(" ::: Got a cleanup notification :::");
            }
        });
    }

    error(error){
        Janus.error(error);
    }

    destroyed(){
        Janus.log(" ::: destroyed :::");
    }
}

let videoConnection = new VideoConnection();
export default videoConnection;