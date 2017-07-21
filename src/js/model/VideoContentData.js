/**
 * Created by haoweirui on 2017/7/13.
 * 视频容器数据
 */
import VideoData from "./cell/VideoData.js";

class VideoContentData{

    constructor(){
        this.videoList = [];

        this.layoutStyle = 'normal';//代表当前的排布状态  normal  admin
        this.adminIndex = -1;//代表当前的主屏index  没有主屏时为-1

        this.width = 0;
        this.height = 0;
        
        this.borderWidth = 0;
        this.borderHeight = 0;
        this.borderX = 0;
        this.borderY = 0;
        this.borderVisible = false;
        
        this.MARGINCON = 40;//定义距离外边框的边距
        this.MARGIN = 10;//定义距离每个视频框的边距
        this.SCALE = 4/3;//定义视频比例
        this.SIZEMAX = 0.7;//保证主屏占据十分之七的区域

        this.test();
    }

    setSize(w,h){
        this.width = w;
        this.height = h;
        this.changeVideoAdmin('resize');
    }

    enumColumn(width,height,marginCon,margin,count,scale){
        let curCol = 0,//从1开始枚举

            maxStatus = {
                width : 0,
                height : 0,
                marginL : 0,
                marginT : 0,
                rowCount:0,//横向多少个
                colCount:0//纵向多少个
            };//记录最理想的情况  保证不出滚动条的情况下选择视频框最大的情况

        while(++curCol <= count){
            //先考虑特定高度的情况下宽度是多少
            let itemCountRow = Math.ceil(count/curCol), //计算出当前行数下最美观的情况下横向多少个
                item_heightMax = (height-marginCon*2-margin*(curCol-1))/curCol,//计算当前行数下的最大高度
                item_height = item_heightMax,
                item_widthAMax = width-marginCon*2,
                item_width = item_height*scale,
                curItem_widthA = item_width*itemCountRow+margin*(itemCountRow-1);
            if( curItem_widthA > item_widthAMax ){
                //如果判定当前超出了总宽度，则调整
                let moreValue = curItem_widthA - item_widthAMax,
                    everyItemDel = (moreValue-margin*(itemCountRow-1))/itemCountRow;
                //重新更新宽高
                item_width = item_width - everyItemDel;
                item_height = item_width/scale;
            }
            //重新计算相关的值
            if(item_width > maxStatus.width){
                //更加理想的情况
                maxStatus.width = item_width;
                maxStatus.height = item_height;
                maxStatus.marginL = (width-(item_width+margin)*itemCountRow + margin)/2;
                maxStatus.marginT = (height-(item_height+margin)*curCol + margin)/2;
                maxStatus.rowCount = itemCountRow;
                maxStatus.colCount = curCol;
            }
        }
        return maxStatus;
    }

    test(){
        for(let i = 0;i<50;i++)
        {
            let data = new VideoData(i);
            data.id = i;
            this.videoList.push(data);
        }
    }

    /**
     * 根据index快捷排序
     */
    quickSort (arr) {
        if (arr.length <= 1) {
            return arr;
        }
        var pivotIndex = Math.floor(arr.length / 2);
        var pivot = arr.splice(pivotIndex, 1)[0];
        var left = [];
        var right = [];
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].index < pivot.index) {
                left.push(arr[i]);
            } else {
                right.push(arr[i]);
            }
        }
        return this.quickSort(left).concat([pivot], this.quickSort(right));
    }

    /**
     * 交换2个视频
     * @param index1
     * @param index2
     */
    changeVideo(index1,index2){
        var videoData1 = null;
        var videoData2 = null;
        var i1 = -1,
            i2 = -1;
        var i = 0,
            j = this.videoList.length;
        for(;i<j;i++){
            if(this.videoList[i].index == index1){
                i1 = i;
            }else if(this.videoList[i].index == index2){
                i2 = i;
            }
            if(i1!=-1 && i2!=-1){
                break;
            }
        }

        videoData1 = this.videoList[i1];
        videoData2 = this.videoList[i2];


        var tempObj = Object.assign({}, videoData1);
        videoData1.x = videoData2.x;
        videoData1.y = videoData2.y;
        videoData1.width = videoData2.width;
        videoData1.height = videoData2.height;
        videoData1.index = videoData2.index;

        videoData2.x = tempObj.x;
        videoData2.y = tempObj.y;
        videoData2.width = tempObj.width;
        videoData2.height = tempObj.height;
        videoData2.index = tempObj.index;
    }

    /**
     * 交换主副视频
     * @param isResize  代表是否是缩放引起的布局改变
     * @param targetIndex 当前目标元素的索引值  可选
     */
    changeVideoAdmin(type,targetIndex){
        var type = type,
            targetIndex = targetIndex;
        targetIndex == undefined && (targetIndex = -1);

        var sizeMax = this.SIZEMAX,
            widthMax = this.width*sizeMax,
            heightMax = this.height,
            widthOther = this.width - widthMax,
            heightOther = heightMax,
            marginCon = this.MARGINCON,
            margin = this.MARGIN,
            scale = this.SCALE,
            videoNumOther = this.videoList.length-1;

        //当为缩放引起的布局改变  需要重新获取布局数据
        //通过算法获取当前排列信息
        var norVideo = null,
            adminVideo = null;
        var col = 0;//当前第一排
        var row = -1;//当前第一列

        if(type == 'resize'){
            if(this.layoutStyle == 'normal'){
                //正常布局缩放
                normalResize.call(this);
            }
            else if(this.layoutStyle == 'admin'){
                //主副屏模式缩放
                adminChange.call(this,this.adminIndex,true);
            }
        }
        else if(type == 'change'){
            //点击切换主副屏
            if(this.layoutStyle == 'normal'){
                //正常切换为主副屏模式
                adminChange.call(this,targetIndex,false);
            }
            else if(this.layoutStyle == 'admin'){
                if(this.adminIndex == targetIndex){
                    //如果当前的主屏index和传入的相同，则为退出主副屏模式
                    normalResize.call(this);
                }else{
                    //切换主屏  只要切换当前对应的id的数据即可
                    this.changeVideo(targetIndex,0);
                }
            }
        }else if(type == 'remove'){
            //移除某个元素
            if(targetIndex == this.adminIndex){
                this.layoutStyle = 'normal';
                this.adminIndex = -1;
            }
        }

        function adminChange(adminIndex) {
            norVideo = this.enumColumn(widthOther,heightOther,marginCon,margin,videoNumOther,scale);
            adminVideo = this.enumColumn(widthMax,heightMax,marginCon,margin,1,scale);

            var maxAreaWidth = adminVideo.width+adminVideo.marginL*2;
            this.videoList = this.quickSort(this.videoList);
            for(var i = 0,otherI = 1;i<this.videoList.length;i++)
            {
                var videoData = this.videoList[i];
                if(videoData.index == adminIndex){
                    //主video
                    videoData.width = adminVideo.width;
                    videoData.height = adminVideo.height;
                    videoData.x = adminVideo.marginL;
                    videoData.y = adminVideo.marginT;
                    videoData.index = 0;
                }else{
                    //副video
                    var tem = Math.floor((otherI-1)/norVideo.rowCount);
                    if(tem != col){
                        col = tem;
                        row=0;
                    }else{
                        row++;
                    }
                    videoData.width = norVideo.width;
                    videoData.height = norVideo.height;
                    videoData.y = norVideo.marginT + col*(norVideo.height+this.MARGIN);
                    videoData.x = maxAreaWidth+norVideo.marginL+row*(norVideo.width+this.MARGIN);
                    videoData.index = otherI;
                    otherI++;
                }
            }
            this.layoutStyle = 'admin';
            this.adminIndex = 0;
        }

        function normalResize() {
            widthOther = this.width;
            heightOther = this.height;
            videoNumOther = this.videoList.length;
            norVideo = this.enumColumn(widthOther,heightOther,marginCon,margin,videoNumOther,scale);

            this.videoList = this.quickSort(this.videoList);
            for(var i = 0;i<this.videoList.length;i++)
            {
                var tem = Math.floor(i/norVideo.rowCount);
                if(tem != col){
                    col = tem;
                    row=0;
                }else{
                    row++;
                }

                var videoData = this.videoList[i];
                videoData.width = norVideo.width;
                videoData.height = norVideo.height;
                videoData.y = norVideo.marginT + col*(norVideo.height+this.MARGIN);
                videoData.x = norVideo.marginL+row*(norVideo.width+this.MARGIN);
            }
            this.layoutStyle = 'normal';
            this.adminIndex = -1;
        }
    }


    /**
     * 根据索引获取某个视频数据
     * @param index
     */
    getVideoByIndex(index){
        for(let data of this.videoList)
        {
            if(data.index == index)
            {
                return data;
            }
        }
        return null;
    }

    addVideo(stream){
        let data = new VideoData(this.videoList.length);
        data.stream = stream;
        data.id = stream.id;
        this.videoList.push(data);
    }

    getVideoInfo(id){
        var dataCur = null;
        for(let i = 0;i<this.videoList.length;i++)
        {
            let data = this.videoList[i];
            if(data.id == id)
            {
                dataCur = data;
            }
        }
        return dataCur;
    }

    removeVideo(id){
        for(let i = 0;i<this.videoList.length;i++)
        {
            let data = this.videoList[i];
            if(data.id == id)
            {
                this.videoList.splice(i,1);
                return;
            }
        }
    }
}

let videoContentData = new VideoContentData();
export default videoContentData;