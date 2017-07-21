/**
 * Created by haoweirui on 2017/7/13.
 * Redux框架
 */
import {createStore} from 'redux';
import mainData from './MainData.js';
import loginData from './LoginData.js';
import roomData from './RoomData.js';
import chatData from './ChatData.js';
import videoContentData from './VideoContentData.js';
import videoConnection from '../util/VideoConnection.js';

/**
 * 数据层
 */
let state = {};

/**
 * 主界面数据
 */
state.mainData = mainData;

/**
 * 登录界面数据
 */
state.loginData = loginData;

/**
 * 房间界面数据
 */
state.roomData = roomData;

/**
 * 聊天界面数据
 */
state.chatData = chatData;

/**
 * 视频界面数据
 */
state.videoContentData = videoContentData;




/**
 * 指令集
 */
let ACTION = {
    //登录
    LOGIN:"LOGIN",

    //显示聊天界面
    SHOW_CHAT:"SHOW_CHAT",

    //增加一条聊天
    ADD_CHAT:"ADD_CHAT",

    //增加一个视频
    ADD_VIDEO:"ADD_VIDEO",
}




/**
 * 指令处理
 * @param state
 * @param action
 */
let reducer = function(state,action){
    switch(action.type){
        case ACTION.LOGIN:
            state.mainData.status = 1;
            videoConnection.connectVideo();
            return state;

        case ACTION.SHOW_CHAT:
            state.roomData.chatVisible = !state.roomData.chatVisible;
            return state;

        case ACTION.ADD_CHAT:
            state.chatData.addChat(action.name,action.content);
            return state;

        case ACTION.ADD_VIDEO:
            state.videoContentData.addVideo();
            return state;

        default:
            return state;
    }
}


let store = createStore(reducer,state);

export {store,state,ACTION};