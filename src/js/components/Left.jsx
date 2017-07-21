/**
 * Created by haoweirui on 2017/7/13.
 * 房间左侧边栏
 */
import React from 'React';
import {store,state,ACTION} from '../model/store.js';

class Left extends React.Component{
    constructor (props) {
        super(props);
        this.state = state.loginData;
        store.subscribe(this.changeHandle.bind(this));
    }

    changeHandle () {
        this.setState(store.getState().loginData);
    }

    render() {
        return (
            <div>
                <a className="add">+</a>
            </div>
        );
    }
}

export default Left;

























