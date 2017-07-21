/**
 * Created by haoweirui on 2017/7/13.
 * 单个视频数据
 */

class VideoData{

    constructor(index){
        this.index = index;

        this.id = 0;

        this.stream = null;

        this.url = "";

        this.x = 0;
        this.y = 0;
        
        this.width = 300;
        this.height = 300;
        this.color = '#'+Math.floor(Math.random()*10)+'F'+Math.floor(Math.random()*10)+'F'+Math.floor(Math.random()*10)+'F'
    }

}

export default VideoData;