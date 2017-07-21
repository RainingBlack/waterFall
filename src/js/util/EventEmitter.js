/**
 * Created by Administrator on 2017/7/20.
 * 事件基类
 */

class EventEmitter{

    constructor(){

    }

    on(eventName, callback) {
        if(!this.handles){
            //this.handles={};
            Object.defineProperty(this, "handles", {
                value: {},
                enumerable: false,
                configurable: true,
                writable: true
            })
        }
        if(!this.handles[eventName]){
            this.handles[eventName]=[];
        }
        this.handles[eventName].push(callback);
    }

    emit(eventName) {
        if(this.handles[arguments[0]]){
            for(var i=0;i<this.handles[arguments[0]].length;i++){
                this.handles[arguments[0]][i](arguments[1]);
            }
        }
    }
}

export default EventEmitter;