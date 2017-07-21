/**
 * Created by haoweirui on 2017/7/13.
 * 视频区容器
 */
import React from 'React';
import ReactDom from 'react-dom';
import {store,state,ACTION} from '../model/store.js';
import Video from './cell/Video.jsx';
import videoConnection from '../util/VideoConnection.js';
import Const from "../util/Const.js";

class VideoContent extends React.Component{
    constructor (props) {
        super(props);

        //视频是否被点击
        this.isVideoDown = false;

        //当前被点击的视频索引
        this.curIndex = -1;

        //拖拽用，鼠标点击的起始坐标
        this.startX = 0;
        this.startY = 0;

        this.state = state.videoContentData;
        store.subscribe(this.changeHandle.bind(this));

        videoConnection.on(Const.EVENT_ADDSTREAM,this.addVideoHandle.bind(this));
        videoConnection.on(Const.EVENT_REMOVESTREAM,this.removeVideoHandle.bind(this));
    }

    addVideoHandle(stream){
        state.videoContentData.addVideo(stream);
        this.onresize();
        //this.setState(state.videoContentData);
    }

    removeVideoHandle(stream){
        var videoInfo = state.videoContentData.getVideoInfo(stream.id);
        state.videoContentData.removeVideo(stream.id);

        stream && state.videoContentData.changeVideoAdmin('remove',videoInfo.index);
        this.onresize();
    }

    changeHandle () {
        this.setState(store.getState().videoContentData);
    }

    componentDidMount(){
        //console.log("VideoContent渲染完毕",this.videoContent);
        window.onresize = this.onresize.bind(this);
        this.onresize();
    }

    onresize(){
        //console.log("视频区尺寸变化",this.videoContent.clientWidth);
        state.videoContentData.setSize(this.videoContent.clientWidth,this.videoContent.clientHeight);
        this.setState(state.videoContentData);
    }

    clickHandle(e){
        var curTarget = e.target || e;
        //检测当前如果是最大化按钮
        if(curTarget.dataset && curTarget.dataset.type && curTarget.dataset.type=='max_video'){
            //获取相关数据
            var curIndex = curTarget.dataset.index;

            state.videoContentData.changeVideoAdmin('change',curIndex);
            this.setState(state.videoContentData);
        }
    }

    downHandle(e){
        //console.log("视频被点击",e.target.dataset.index);
        if(e.target.dataset.index != undefined) {
            this.isVideoDown = true;
            this.curIndex = e.target.dataset.index;

            //显示拖拽框
            let videoData = state.videoContentData.getVideoByIndex(e.target.dataset.index);
            this.state.borderVisible = true;
            this.state.borderX = videoData.x;
            this.state.borderY = videoData.y;
            this.state.borderWidth = videoData.width;
            this.state.borderHeight = videoData.height;
            this.setState(this.state);

            this.startX = e.clientX;
            this.startY = e.clientY;
        }

        e.preventDefault();
        e.stopPropagation();
    }

    moveHandle(e){
        //console.log("视频移动",e.type);

        let moveX = e.clientX - this.startX;
        let moveY = e.clientY - this.startY;

        this.state.borderX += moveX;
        this.state.borderY += moveY;

        this.startX = e.clientX;
        this.startY = e.clientY;

        this.setState(this.state);

        e.preventDefault();
        e.stopPropagation();
    }

    upHandle(e){
        //e.persist();
        this.isVideoDown = false;
        state.videoContentData.borderVisible = false;

        if((this.curIndex != e.target.dataset.index) && (e.target.dataset.index != undefined))
        {
            //console.log("交换视频位置");
            state.videoContentData.changeVideo(this.curIndex,e.target.dataset.index);
        }

        this.setState(state.videoContentData);

        e.preventDefault();
        e.stopPropagation();
    }

    render() {
        return (
            <div className="video-content" ref={(videoContent)=>{this.videoContent = videoContent}}
                 onMouseDown={this.downHandle.bind(this)} onMouseMove={this.moveHandle.bind(this)} onMouseUp={this.upHandle.bind(this)} onClick={this.clickHandle.bind(this)}>
                {this.state.videoList.map(function(videoData){
                    return <Video data={videoData} key={videoData.id}></Video>
                })}
                <span className="border" style={{display:this.state.borderVisible?"block":"none",width:this.state.borderWidth + "px",height:this.state.borderHeight + "px",left:this.state.borderX + "px",top:this.state.borderY + "px"}}></span>
            </div>
        );
    }
}

export default VideoContent;

























