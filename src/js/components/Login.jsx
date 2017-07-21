/**
 * Created by haoweirui on 2017/7/13.
 * 登录界面
 */
import React from 'React';
import {store,state,ACTION} from '../model/store.js';

class Login extends React.Component{
    constructor (props) {
        super(props);
        this.state = state.loginData;
        store.subscribe(this.changeHandle.bind(this));
    }

    changeHandle () {
        this.setState(store.getState().loginData);
    }

    registerHandle(){
        console.log("点击注册");
    }

    loginHandle(){
        console.log("点击登录");
        store.dispatch({type:ACTION.LOGIN});
    }

    createHandle(){
        console.log("点击创建");
    }

    render() {
        return (
            <div>
                <div className="top">
                    <span>logo</span>
                    <span>
                        <a className="btn btn-default register" onClick={this.registerHandle}>注册</a>
                        <a className="btn btn-default login" onClick={this.loginHandle}>登录</a>
                    </span>
                </div>
                <div className="content">
                    <a className="btn btn-default create" onClick={this.createHandle}>创建群组</a>
                </div>
            </div>
        );
    }
}

export default Login;

























