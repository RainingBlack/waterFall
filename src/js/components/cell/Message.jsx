/**
 * Created by haoweirui on 2017/7/13.
 * 单条聊天
 */
import React from 'React';
import {store,state,ACTION} from '../../model/store.js';

class Message extends React.Component{
    constructor (props) {
        super(props);
        //store.subscribe(this.changeHandle.bind(this));
    }

    changeHandle () {
        //this.setState(store.getState().loginData);
    }

    render() {
        this.state = this.props.data;
        return (
            <li>
                <img src="http://img1.2345.com/duoteimg/qqTxImg/2013/12/ka_3/01-013921_935.jpg"/>
                <div className="right">
                    <div className="name">{this.state.name}</div>
                    <div className="content">
                        <span className="text">{this.state.content}</span>
                    </div>
                </div>
            </li>
        );
    }
}

export default Message;

























