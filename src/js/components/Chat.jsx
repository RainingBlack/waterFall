/**
 * Created by haoweirui on 2017/7/13.
 * 聊天界面
 */
import React from 'React';
import {store,state,ACTION} from '../model/store.js';
import Message from './cell/Message.jsx';

class Chat extends React.Component{
    constructor (props) {
        super(props);
        this.state = state.chatData;
        store.subscribe(this.changeHandle.bind(this));
    }

    changeHandle () {
        this.setState(store.getState().chatData);
    }

    keydownHandle(e){
        if(e.keyCode == 13)
        {
            let content = this.textarea.value;
            if(content != ""){
                store.dispatch({type:ACTION.ADD_CHAT,name:"用户名",content:content});
                this.textarea.value = "";
            }
            console.log("聊天区回车按下");
        }
    }

    render() {
        return (
            <div>
                <div className="title">临时聊天</div>
                <div className="chat-content">
                    <ul>
                        {this.state.chatList.map(function(messageData){
                            return <Message data={messageData}></Message>
                        })}
                    </ul>
                </div>
                <div className="chat-input">
                    <textarea ref={(textarea)=>{this.textarea = textarea;}} onKeyDown={this.keydownHandle.bind(this)}/>
                </div>
            </div>
        );
    }
}

export default Chat;

























