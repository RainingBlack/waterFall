/**
 * Created by haoweirui on 2017/7/13.
 * 单个视频
 */
import React from 'React';
import TweenOne from 'rc-tween-one';
import {store,state,ACTION} from '../../model/store.js';

class Video extends React.Component{
    constructor (props) {
        super(props);
    }

    downHandle(){
        console.log("视频被点击",this);
        /*
         <div className="video" style={{width:this.state.width + "px",height:this.state.height + "px",left:this.state.x + "px",top:this.state.y + "px"}}
         data-index={this.state.index}>
         </div>
         */
    }

    componentDidMount(){
        this.video.srcObject = this.state.stream;
        //console.error("video componentDidMount");
    }

    componentDidUpdate(){
        //this.video.srcObject = this.state.stream;
        //console.error("video componentDidUpdate");
    }

    render() {
        this.state = this.props.data;
        return (
            <TweenOne className="video" data-color={this.state.color} style={{backgroundColor:this.state.color}} data-index={this.state.index}
                      animation={{left:this.state.x,top:this.state.y,width:this.state.width,height:this.state.height}}
                      data-id={this.state.id}>
                <div data-index={this.state.index}>
                    <video ref={(video)=>{this.video = video;}}/>
                    <img className="video_img" src="./image/max.png" data-type="max_video" data-index={this.state.index}/>
                </div>
            </TweenOne>
        );
    }
}

export default Video;

























