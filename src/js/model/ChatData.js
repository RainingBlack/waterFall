/**
 * Created by haoweirui on 2017/7/13.
 * 聊天数据
 */
import MessageData from "./cell/MessageData.js";

class ChatData{

    constructor(){
        this.chatList = [];
    }


    addChat(name,content){
        let messageData = new MessageData(name,content);
        this.chatList.push(messageData);
    }


}

let chatData = new ChatData();
export default chatData;