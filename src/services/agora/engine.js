// src/services/agora/engine.js - FOR AGORA v4.5.3
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
} from 'react-native-agora';

class AgoraEngine {
  engine = null;

  async init(appId) {
    if (this.engine) {
      console.log('✅ [Agora] Engine already initialized');
      return this.engine;
    }

    try {
      console.log('🔊 [Agora] Creating engine with appId:', appId?.substring(0, 8) + '...');
      
      // Create engine
      this.engine = createAgoraRtcEngine();
      
      // Initialize with appId and channel profile
      this.engine.initialize({
        appId: appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      console.log('🔊 [Agora] Enabling audio...');
      this.engine.enableAudio();
      
      // Route audio to speaker by default
      this.engine.setDefaultAudioRouteToSpeakerphone(true);
      
      console.log('✅ [Agora] Engine initialized successfully');
      return this.engine;
    } catch (error) {
      console.error('❌ [Agora] Init failed:', error);
      this.engine = null;
      throw error;
    }
  }

  get() {
    return this.engine;
  }

   setupLocalVideo(enable) {
    if (!this.engine) return;
    if (enable) {
      // 0 = local user, 1 = Hidden (Fit), 1 = Mirror mode enabled
      this.engine.setupLocalVideo({
        sourceType: 0, // VideoSourceTypeCamera
        uid: 0,
        view: null, // RtcSurfaceView handles the view, but setup ensures internal binding
        renderMode: 1, // RenderModeHidden
        mirrorMode: 1, // VideoMirrorModeEnabled
      });
    }
  }

    async join(token, channel, uid, enableVideo) {
    if (!this.engine) {
      throw new Error('[Agora] Engine not initialized');
    }

    console.log('🚀 [Agora] Joining channel:', { channel, uid, enableVideo });

    try {
      if (enableVideo) {
        console.log('📹 [Agora] Enabling video...');
        this.engine.enableVideo();
        
        // ✅ CRITICAL FIX: Setup local video canvas internally before preview
        this.engine.setupLocalVideo({
          sourceType: 0, 
          uid: 0,
          view: null, 
          renderMode: 1,
          mirrorMode: 1
        });

        this.engine.startPreview();
      } else {
        console.log('🔇 [Agora] Audio only mode');
        this.engine.disableVideo();
      }

      // Join channel
      this.engine.joinChannel(token, channel, uid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: enableVideo,
        autoSubscribeAudio: true,
        autoSubscribeVideo: enableVideo,
      });

      console.log('✅ [Agora] joinChannel() called');
    } catch (error) {
      console.error('❌ [Agora] Join failed:', error);
      throw error;
    }
  }


  async leave() {
    if (!this.engine) return;
    
    try {
      console.log('🚪 [Agora] Leaving channel...');
      this.engine.leaveChannel();
      console.log('✅ [Agora] Left channel');
    } catch (e) {
      console.error('⚠️ [Agora] Leave error:', e);
    }
  }

  async destroy() {
    if (!this.engine) return;
    
    try {
      console.log('🗑️ [Agora] Destroying engine...');
      this.engine.release();
      this.engine = null;
      console.log('✅ [Agora] Engine destroyed');
    } catch (e) {
      console.error('⚠️ [Agora] Destroy error:', e);
    }
  }

  // Event handler registration (v4.x uses registerEventHandler)
  registerEventHandler(handlers) {
    if (!this.engine) {
      console.error('❌ [Agora] Cannot register handlers, engine not initialized');
      return;
    }
    this.engine.registerEventHandler(handlers);
  }

  // Controls
  setMic(on) {
    if (!this.engine) return;
    console.log(`🎤 [Agora] ${on ? 'Unmuting' : 'Muting'} mic`);
    this.engine.muteLocalAudioStream(!on);
  }

  setVideo(on) {
    if (!this.engine) return;
    console.log(`📹 [Agora] ${on ? 'Enabling' : 'Disabling'} video`);
    this.engine.enableLocalVideo(on);
  }

  switchCamera() {
    if (!this.engine) return;
    console.log('🔄 [Agora] Switching camera');
    this.engine.switchCamera();
  }

  setSpeaker(on) {
    if (!this.engine) return;
    
    try {
      console.log(`🔊 [Agora] ${on ? 'Enabling' : 'Disabling'} speaker`);
      
      // Try using setEnableSpeakerphone (may not exist in v4.x)
      if (typeof this.engine.setEnableSpeakerphone === 'function') {
        this.engine.setEnableSpeakerphone(on);
      } else {
        // Fallback: setDefaultAudioRouteToSpeakerphone works for the session
        console.log('⚠️ [Agora] setEnableSpeakerphone not available, using default route');
        this.engine.setDefaultAudioRouteToSpeakerphone(on);
      }
    } catch (error) {
      console.warn('⚠️ [Agora] setSpeaker error (non-critical):', error.message);
    }
  }
}

export default new AgoraEngine();
