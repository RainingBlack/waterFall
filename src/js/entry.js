/**
 * Created by haoweirui on 2017/7/13.
 * 入口
 */
import "../css/index.less";
import React from 'react';
import ReactDom from 'react-dom';
import Main from './components/Main.jsx';
import {store,state,ACTION} from './model/store.js';

class Entry {
    constructor(){
        this.init();
    }

    init(){
        /**
         * 主界面
         */
        ReactDom.render(
            <Main/>,
            document.querySelector("#main")
        )
    }

    test(){
        store.dispatch({type:ACTION.TEST,username:"mebutoo"});
    }

}

window.entry = new Entry();
export default entry;