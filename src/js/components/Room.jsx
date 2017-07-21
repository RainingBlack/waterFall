/**
 * Created by haoweirui on 2017/7/13.
 * 房间界面
 */
import React from 'React';
import ReactDom from 'react-dom';
import {store,state,ACTION} from '../model/store.js';
import Left from './Left.jsx';
import Top from './Top.jsx';
import Chat from './Chat.jsx';
import VideoContent from './VideoContent.jsx';

class Room extends React.Component{
    constructor (props) {
        super(props);
        this.state = state.roomData;
        store.subscribe(this.changeHandle.bind(this));
    }

    changeHandle () {
        this.setState(store.getState().roomData);
    }

    componentDidMount(){
        /**
         * 左侧边栏
         */
        ReactDom.render(
            <Left/>,
            document.querySelector("#left")
        )

        /**
         * 顶部界面
         */
        ReactDom.render(
            <Top/>,
            document.querySelector("#top")
        )

        /**
         * 聊天界面
         */
        ReactDom.render(
            <Chat/>,
            document.querySelector("#chat")
        )

        /**
         * 视频区界面
         */
        ReactDom.render(
            <VideoContent/>,
            document.querySelector("#video-content")
        )
    }

    render() {
        return (
            <div>
                <div id="left"></div>
                <div className="right">
                    <div id="top"></div>
                    <div id="video-content"></div>
                </div>
                <div id="chat" className={this.state.chatVisible?"show":"hide"}></div>
            </div>
        );
    }
}

export default Room;

























