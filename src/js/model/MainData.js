/**
 * Created by haoweirui on 2017/7/13.
 * 主界面数据
 */

class MainData{

    constructor(){
        //状态 0登录界面 1房间界面
        this._status = 0;

        //登录界面是否显示
        this.loginVisible = true;

        //房间界面是否显示
        this.roomVisible = false;
    }
    
    set status(status){
        this._status = status;

        switch(status)
        {
            case 0:
                this.loginVisible = true;
                this.roomVisible = false;
                break;

            case 1:
                this.loginVisible = false;
                this.roomVisible = true;
                break;
        }
    }

    get status(){
        return this._status;
    }
}

let mainData = new MainData();
export default mainData;