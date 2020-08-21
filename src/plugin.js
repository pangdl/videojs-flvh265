import videojs from 'video.js';
import WXInlinePlayer from 'wx-inline-player-new';
import { version as VERSION } from '../package.json';

const Tech = videojs.getComponent('Tech');
const Dom = videojs.dom;
const createTimeRange = videojs.createTimeRange;

/**
 * 生命周期对应的状态
 */
const STATE = {
  created: "created",
  play: "play",
  playing: "playing",
  buffering: "buffering",
  /**video.js没有stopped状态，paused也包含stopped */
  paused: "paused",
  resumed: "resumed",
  // ended: "ended", video.js没有ended这个状态
  stopped: "stopped",
  destroyed: "destroyed"
};


/**
 * An array of events available on the `FlvH265` tech.
 * no used now.
 *
 * @private
 * @type {JSON}
 */
const EVENT = {
  loadstart: "loadSuccess",
  play: "play",
  pause: "paused",
  playing: "playing",
  waiting:"buffering",
  ended: "ended",
  volumechange: "",
  durationchange: "timeUpdate",
  error: "loadError"
};

/**
 * 支持的自定义属性，作为<video>标签的属性。
 * 外部设置属性时并不区分大小写。
 */
const customAttrs = ['isH265','isLive','hasVideo','hasAudio','lib'];

/**
 * Media Controller - Wrapper for Media API
 *
 * @mixes WXInlinePlayer
 * @extends Tech
 */
class FlvH265 extends Tech {

  constructor(options, ready) {
    super(options, ready);

    let self = this;

    self.debug = false;
    self.currentTime_ = 0;
    self.sate = STATE.created; //状态，hack for video.js
    self.isEnded = false; //因为videol.js没有ended状态，这里单独设置一个变量（非状态）标志是否播放完，

    //7.8.4丢失了这个属性，和github源码不一致，手动补全
    self.options_.disablePictureInPicture = true; 


    let _isH265 = self.params.isH265?"h265":"all";
    let _lib = self.params.lib?self.params.lib:"/node_modules/wx-inline-player-new/example/";
    // Merge default parames with ones passed in
    self.params = Object.assign({
      asmUrl:   `${_lib}/prod.${_isH265}.asm.combine.js`,
      wasmUrl:  `${_lib}/prod.${_isH265}.wasm.combine.js`,
      url: self.options_.source.src,
      $container: self.el_,
      volume: 1.0,
      muted: self.options_.muted !== undefined ? self.options_.muted : false,
      autoplay: self.options_.autoplay,
      loop: self.options_.loop !== undefined ? self.options_.loop : false,
      chunkSize: 128 * 1024,
      preloadTime: 5e2,
      bufferingTime: 1e3,
      cacheSegmentCount: 64,
      customLoader: null
    },self.params);

    WXInlinePlayer.ready(self.params).then(player => {
      self.triggerReady();
      self.player = player;
      self.initEvent_(self.params);

      if(self.params.autoplay)
        self.play();
    });
  }

  /**
   * Create the `FlvH265` Tech's DOM element.
   *
   * @return {Element}
   *         The element that gets created.
   */
  createEl() {
    let self = this;
    self.params = FlvH265.getAttributes_(document.getElementById(self.options_.playerId));

    const options = self.options_;

    // Generate ID for canvas object
    const objId = options.techId;

    self.el_ = FlvH265.embed(objId);

    self.el_.tech = self;

    return self.el_;
  }

  static getAttributes_(tag) {
    const obj = {};  
    const tmpArr = customAttrs.map(item=>item.toLocaleLowerCase());
    const tmpArrBoolean = tmpArr.slice(0,tmpArr.length-1);
    // known boolean attributes
    // we can check for matching boolean properties, but not all browsers
    // and not all tags know about these attributes, so, we still want to check them manually
    const knownBooleans = ',' + tmpArrBoolean.join(',')+ ',';
  
    if (tag && tag.attributes && tag.attributes.length > 0) {
      const attrs = tag.attributes;
  
      for (let i = attrs.length - 1; i >= 0; i--) {
        const attrName = attrs[i].name;
        let finalAttrName = '';
        let index = tmpArr.indexOf(attrName);
        if(index===-1) 
          continue;
        else{
          finalAttrName=customAttrs[index];
        }

        let attrVal = attrs[i].value;
  
        // check for known booleans
        // the matching element property will return a value for typeof
        if (typeof tag[attrName] === 'boolean' || knownBooleans.indexOf(',' + attrName + ',') !== -1) {
          // the value of an included boolean attribute is typically an empty
          // string ('') which would equal false if we just check for a false value.
          // we also don't want support bad code like autoplay='false'
          attrVal = (attrVal !== null) ? true : false;
        }
  
        obj[finalAttrName] = attrVal;
      }
    }
  
    return Object.assign({
        isH265:false,
        isLive:false,
        hasVideo:false,
        hasAudio:false
      },obj);
  }

  initEvent_(params) {
    let self = this;
    let $canvas = self.$canvas = params.$container;
    let videoHeight = self.el_.parentElement.offsetHeight;
    let videoWidth = self.el_.parentElement.offsetWidth;

    //set the canvas' height and width
    self.player.on('mediaInfo', mediaInfo => {
      self.log()(`mediaInfo`, mediaInfo, videoHeight, videoWidth);
      const {
        onMetaData
      } = mediaInfo;
      //1.下面这里指定高宽，其实是解码器绘制的真实的高宽
      $canvas.height = onMetaData.height || videoHeight;
      $canvas.width = onMetaData.width || videoWidth;
      for (let i = 0; i < onMetaData.length; i++) {
        if ('height' in onMetaData[i]) {
          $canvas.height = onMetaData[i].height;
        } else if ('width' in onMetaData[i]) {
          $canvas.width = onMetaData[i].width;
        }
      }
      //2.这里指定高宽，是拉伸canvas以便填满指定高宽的矩形。设成100%以便全屏时自动缩放
      $canvas.style.height = '100%'; //videoHeight + `px`;
      $canvas.style.width = '100%'; //videoWidth + `px`;
    });

    //set other events

    /*for (let k in Events) {
      self.log()(k);
      this.player.on(Events[k], function(d){
        self.trigger(k, d)
      });
    }*/

    self.player.on('loadSuccess',function(){
      self.trigger('loadstart');
    });

    self.player.on('play', function(){
      // document.querySelector("#"+self.options_.techId).parentElement.querySelector(".vjs-big-play-button").style.display='none';
      self.trigger('play');
      self.state = STATE.play;
      self.isEnded = false;
    });
    self.player.on('resumed', function(){
      // document.querySelector("#"+self.options_.techId).parentElement.querySelector(".vjs-big-play-button").style.display='none';
      self.trigger('play');
      self.state = STATE.play;
    });

    self.player.on('playing', function(){
      // document.querySelector("#"+self.options_.techId).parentElement.querySelector(".vjs-big-play-button").style.display='none';
      self.trigger('playing');
      self.state = STATE.playing;
    });

    self.player.on('buffering',function(){
      self.trigger('waiting');
    });

    self.player.on('paused', function(){
      // document.querySelector("#"+self.options_.techId).parentElement.querySelector(".vjs-big-play-button").style.display='block';
      self.trigger('pause');
      self.state = STATE.paused;
    });
    //video.js没有stopped，适配一下video.js的事件
    self.player.on('stopped', function () {
      // document.querySelector("#"+self.options_.techId).parentElement.querySelector(".vjs-big-play-button").style.display='block';
      self.trigger('pause');
      self.state = STATE.paused;
    });
    
    self.player.on('timeUpdate', function(d){
      self.log()(self.duration(),d/1000)
      self.trigger('durationchange',d/1000);
    });

    self.player.on('ended', function(){
      self.trigger('ended');
      self.state = STATE.paused;
      self.isEnded = true;
    });

    self.player.on('loadError',function(){
      self.trigger('error');
    });

  }

  /**
   * Called by {@link Player#play} to play using the `FlvH265` Tech.
   * videojs的这个钩子函数包括多种职责（这是不妥的）
   * 1.首次播放
   * 2.暂停后继续播放
   * 3.重播
   */
  play() {
    //重播
    if (this.ended()) {
      this.currentTime(0);
      this.player.stop();
      this.player.play();
    }
    //非重播
    else{
      if(this.state == STATE.paused)
        this.params.isLive ? this.player.play() : this.player.resume();
      else
        this.player.play();
    }
  }

  played(){
  }

  /**
   * Called by {@link Player#pause} to pause using the `FlvH265` `Tech`.
   */
  pause() {
    this.params.isLive ? this.player.stop() : this.player.pause();
  }

  paused() {
    return this.state == STATE.paused;
  }

  /**
   * Get the current playback time in seconds
   *
   * @return {number}
   *         The current time of playback in seconds.
   */
  currentTime(p) {
    if(p==undefined){
      return this.player.currentTime()/1000;
    }else{     
      this.player.currentTime(p*1000); 
    }
  }

  /**
   * Get the total duration of the current media.
   *
   * @return {number}
   8          The total duration of the current media.
   */
  duration() {
    return this.player.getDuration()/1000;
  }

  /**
   * Get and create a `TimeRange` object for buffering.
   *
   * @return {TimeRange}
   *         The time range object that was created.
   */
  buffered() {
    return createTimeRange(0, 1024 * 1024);
  }

  /**
   * Get fullscreen support
   *
   * @return {boolean}
   *         The `FlvH265` tech support fullscreen
   */
  supportsFullScreen() {
    return true;
  }

  enterFullScreen() {
    self.$canvas.requestFullscreen();
  }

  dispose() {
    this.player && this.player.destroy();
    super.dispose();
  }

  muted(p) {
    // this.trigger("volumechange");
    return this.player.mute(p);
  }

  setMuted(p){
    this.muted(p);
    this.trigger("volumechange");
  }

  volume(p) {
    // this.trigger("volumechange");
    return this.player.volume(p);
  }

  setVolume(p) {    
    this.volume(p);
    this.trigger("volumechange");
  }

  ended() {
    return this.isEnded; 
  }

  requestPictureInPicture(){
    if(!this.disablePictureInPicture())
      throw new Error(`flvh265 don't support Picture In Picture.`)
  }

  disablePictureInPicture(p){
    if (p === undefined) {
      return this.options_.disablePictureInPicture;
    }
    this.options_.disablePictureInPicture = p;    
  }

  playbackRate(){
    return 1;
  }

  log() {
    if (this.debug) {
      return console.log;
    } else return () => {}
  }

}

/**
 * Check if the `FlvH265` tech is currently supported.
 *
 * @return {boolean}
 */
FlvH265.isSupported = function () {
  return WXInlinePlayer.isSupport();
};

/*
 * Determine if the specified media type can be played back
 * by the Tech
 *
 * @param  {String} type  A media type description
 * @return {String}         'probably', 'maybe', or '' (empty string)
 */
FlvH265.canPlayType = function (type) {
  return (type.indexOf('/x-flv-h265') !== -1) ? 'probably' : (type.indexOf('/x-flv') !== -1) ? 'maybe' : '';
};

/*
 * Check if the tech can support the given source
 * @param  {Object} srcObj  The source object
 * @return {String}         'probably', 'maybe', or '' (empty string)
 */
FlvH265.canPlaySource = function (srcObj) {
  return FlvH265.canPlayType(srcObj.type);
};

FlvH265.embed = function (objId) {
  const code = `<canvas id="${objId}"></canvas>`;

  // Get element by embedding code and retrieving created element
  const obj = Dom.createEl('div', {
    innerHTML: code
  }).childNodes[0];

  return obj;
};

FlvH265.VERSION = VERSION;

Tech.registerTech('Flvh265', FlvH265);
export default FlvH265;