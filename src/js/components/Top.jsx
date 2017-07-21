/**
 * Created by haoweirui on 2017/7/13.
 * 房间顶部界面
 */
import React from 'React';
import {store,state,ACTION} from '../model/store.js';

class Top extends React.Component{
    constructor (props) {
        super(props);
        this.state = state.loginData;
        store.subscribe(this.changeHandle.bind(this));
    }

    changeHandle () {
        this.setState(store.getState().loginData);
    }

    editHandle(){
        console.log("点击群名编辑");
        store.dispatch({type:ACTION.SHOW_CHAT});
    }

    render() {
        return (
            <div>
                <span className="main-left">
                    <span>群组名称</span>
                    <a onClick={this.editHandle} className="btn-edit btn btn-default btn-xs">e</a>
                </span>
                <span className="main-right">
                    <a className="btn btn-info">认领群聊</a>
                    <a className="btn btn-default">群聊上锁</a>
                    <img className="img-thumbnail" src="http://v1.qzone.cc/avatar/201508/17/09/21/55d1372b820a3621.jpg%21200x200.jpg"/>
                </span>
            </div>
        );
    }
}

export default Top;

























