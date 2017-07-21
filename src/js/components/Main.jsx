/**
 * Created by haoweirui on 2017/7/13.
 * 主容器
 */
import React from 'React';
import ReactDom from 'react-dom';
import {store,state,ACTION} from '../model/store.js';
import Login from './Login.jsx';
import Room from './Room.jsx';

class Main extends React.Component{
    constructor (props) {
        super(props);
        this.state = state.mainData;
        store.subscribe(this.changeHandle.bind(this));
    }

    changeHandle () {
        this.setState(store.getState().mainData);
    }

    componentDidMount(){
        console.log("渲染登陆界面");

        state.mainData.status = 1;
        this.setState(state.mainData);

        /**
         * 登录界面
         */
        ReactDom.render(
            <Login/>,
            document.querySelector("#login")
        )

        /**
         * 房间界面
         */
        ReactDom.render(
            <Room/>,
            document.querySelector("#room")
        )
    }

    render() {
        return (
            <div>
                <div id="login" className={this.state.loginVisible?"show":"hide"}></div>
                <div id="room" style={{display:this.state.roomVisible}}></div>
            </div>
        );
    }
}

export default Main;

























