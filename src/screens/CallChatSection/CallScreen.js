import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity,  
  Alert, 
  Platform, 
  PermissionsAndroid, 
  BackHandler,
  Animated,
  Image,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { RtcSurfaceView } from 'react-native-agora';
import { useFocusEffect } from '@react-navigation/native';

import ScreenWrapper from '../../component/ScreenWrapper';
import CallService from '../../services/api/call/CallService';
import AstrologerCallSocket from '../../services/socket/AstrologerCallSocket';
import AgoraEngine from '../../services/agora/engine';
import { STORAGE_KEYS } from '../../config/constants';
import { useSession } from '../../contexts/SessionContext';
import { styles, COLORS } from '../../style/CallStyle';
import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';

const CallScreen = ({ route, navigation }) => {
  const { sessionId, userName = 'User', userImage, callType = 'audio', ratePerMinute = 10 } = route.params || {};

  // ✅ STATE
  const [remainingTime, setRemainingTime] = useState(0);
  const [isMicOn, setMicOn] = useState(true);
  const [isSpeakerOn, setSpeakerOn] = useState(true);
  const [isVideoOn, setVideoOn] = useState(callType === 'video');
  const [remoteUid, setRemoteUid] = useState(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isWaitingForUser, setIsWaitingForUser] = useState(true);
  const [isEnding, setIsEnding] = useState(false);

  // View State (For Swapping Video)
  const [isLocalMain, setLocalMain] = useState(false);

  // ✅ REFS
  const remainingTimeRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasEndedRef = useRef(false);
  const { startSession, endSession } = useSession();

  useEffect(() => {
    const handleForegroundService = async () => {
      if (isConnected) {
        // 1. Create Channel
        await notifee.createChannel({
          id: 'astrologer_call_service',
          name: 'Active Call Service',
          importance: AndroidImportance.HIGH,
        });

        // 2. Start Service
        await notifee.displayNotification({
          id: 'astro_active_call',
          title: 'Ongoing Consultation',
          body: 'Tap to return to call',
          android: {
            channelId: 'astrologer_call_service',
            asForegroundService: true,
            // Types must match Manifest
            foregroundServiceTypes: [
              AndroidForegroundServiceType.MICROPHONE,
              ...(isVideoCall ? [AndroidForegroundServiceType.CAMERA] : [])
            ],
            ongoing: true,
            color: '#4CAF50',
            smallIcon: 'ic_launcher',
            pressAction: { id: 'default', launchActivity: 'default' },
          },
        });
      } else {
        await notifee.stopForegroundService();
      }
    };

    handleForegroundService();

    return () => {
      notifee.stopForegroundService();
    };
  }, [isConnected]);

  // --- SOCKET SETUP ---

  useEffect(() => {
    startSession('call', route.params);
  }, []);

  // --- 1. ANIMATION (Audio Pulse) ---
  useEffect(() => {
    if (callType === 'audio') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [callType]);

  // --- 2. BACK HANDLER ---
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleEnd();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // --- 3. LOCAL TIMER LOGIC ---
  const startLocalTimer = (durationSeconds) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    setIsWaitingForUser(false);
    remainingTimeRef.current = durationSeconds;
    setRemainingTime(durationSeconds);

    timerIntervalRef.current = setInterval(() => {
      if (remainingTimeRef.current > 0) {
        remainingTimeRef.current -= 1;
        setRemainingTime(remainingTimeRef.current);
      } else {
        clearInterval(timerIntervalRef.current);
        // Backend usually handles the actual cut-off
      }
    }, 1000);
  };

  // --- 4. MAIN SETUP ---
  useEffect(() => {
    let mounted = true;
    
    const setup = async () => {
      try {
        const socket = await AstrologerCallSocket.connect();
        if (!mounted || !socket?.connected) return;

        let astroJson = await AsyncStorage.getItem(STORAGE_KEYS.ASTROLOGER_DATA);
        const astrologer = astroJson ? JSON.parse(astroJson) : null;
        
        if (astrologer?._id) {
           AstrologerCallSocket.joinSession(sessionId, astrologer._id);
        }

        // 1. Listen for Credentials
        AstrologerCallSocket.on('call_credentials', async (payload) => {
             if (payload.sessionId !== sessionId) return;
             await initAgora({ ...payload, agoraAstrologerUid: payload.agoraUid });
             AstrologerCallSocket.emit('user_joined_agora', { sessionId, role: 'astrologer' });
        });

        // 2. Listen for Timer
        AstrologerCallSocket.on('timer_start', (payload) => {
            if (payload.sessionId !== sessionId) return;
            startLocalTimer(payload.maxDurationSeconds);
        });

        AstrologerCallSocket.on('timer_tick', (payload) => {
          if (payload.sessionId === sessionId) {
            const diff = Math.abs(remainingTimeRef.current - payload.remainingSeconds);
            if (diff > 2) {
               remainingTimeRef.current = payload.remainingSeconds;
               setRemainingTime(payload.remainingSeconds);
               setIsWaitingForUser(false); 
            }
          }
        });

        AstrologerCallSocket.on('call_ended', () => {
          if (!hasEndedRef.current) {
            hasEndedRef.current = true;
            endSession();
            cleanup();
            Alert.alert('Call Ended', 'The session has ended.', [
               { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }) }
            ]);
          }
        });

        // Sync check
        AstrologerCallSocket.emit('sync_timer', { sessionId }, async (res) => {
          if (res?.success && res.data.remainingSeconds > 0) {
               startLocalTimer(res.data.remainingSeconds);
          }
        });

      } catch (e) { 
        console.error('❌ [ASTRO] Setup failed:', e); 
      }
    };

    setup();
    return () => { 
        mounted = false; 
        cleanup(); 
    };
  }, [sessionId]);

  const initAgora = async (payload) => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA
        ]);
        
        if (granted['android.permission.RECORD_AUDIO'] !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permissions Required', 'Please grant audio permissions.');
            return;
        }
      }
      
      await AgoraEngine.init(payload.agoraAppId);
      setIsEngineReady(true);
      
      AgoraEngine.registerEventHandler({
        onUserJoined: (channel, uid) => { setRemoteUid(uid); },
        onUserOffline: () => { setRemoteUid(null); },
      });

      const uid = Number(payload.agoraAstrologerUid);
      
      await AgoraEngine.join(
        payload.agoraToken,
        payload.agoraChannelName, 
        uid, 
        callType === 'video'
      );

      // Set initial speaker state
      if (callType === 'video') {
           AgoraEngine.setSpeaker(true);
           setSpeakerOn(true);
      } else {
           AgoraEngine.setSpeaker(false);
           setSpeakerOn(false);
      }

    } catch (e) {
        console.error('❌ [ASTRO] Agora init failed:', e);
    }
  };

  const cleanup = async () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    AstrologerCallSocket.off('call_credentials');
    AstrologerCallSocket.off('timer_start');
    AstrologerCallSocket.off('timer_tick');
    AstrologerCallSocket.off('call_ended');
    try { 
      await AgoraEngine.leave(); 
      await AgoraEngine.destroy(); 
    } catch (e) {}
  };

  const formatTime = (s) => {
    if (!s || s < 0) return '00:00';
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEnd = () => {
    if(isEnding || hasEndedRef.current) return;
    setIsEnding(true);

    Alert.alert(
      'End Call', 
      'Are you sure you want to end this session?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setIsEnding(false) },
        {
          text: 'End Call',
          style: 'destructive',
          onPress: async () => {
            try {
              hasEndedRef.current = true;
              await CallService.endCall(sessionId, 'astrologer_ended');
              await endSession();
              cleanup();
              navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            } catch (error) {
              console.error('Failed to end call:', error);
            }
          }
        }
      ],
      { cancelable: false }
    );
  };

  const getImageSource = (img) => {
    if (typeof img === 'string' && img.trim().length > 0) return { uri: img.trim() };
    return require('../../assets/man.png'); // Default avatar
  };

  // --- RENDERERS ---

  const renderAudioCall = () => (
    <LinearGradient colors={[COLORS.BG, COLORS.BG_GRADIENT, COLORS.BG]} style={styles.audioContainer}>
        {/* Reusing the same fixed top overlay structure as Video for consistency */}
        <SafeAreaView style={styles.topOverlayFixed}>
          <View style={styles.topHeaderContent}>
            <View style={styles.timerPill}>
               <View style={[styles.recordingDot, { backgroundColor: remainingTime < 60 ? COLORS.DANGER : COLORS.SUCCESS }]} />
               <Text style={styles.timerText}>{formatTime(remainingTime)}</Text>
            </View>
          </View>
        </SafeAreaView>

        <View style={styles.topSection}>
          <View style={styles.pulseContainer}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.avatarContainer}>
              <Image source={getImageSource(userImage)} style={styles.avatarImage} resizeMode="cover" />
            </View>
          </View>
          <Text style={styles.nameText}>{userName}</Text>
          <Text style={styles.statusText}>{isWaitingForUser ? 'Connecting...' : 'In Call'}</Text>
          
          <View style={styles.infoBadge}>
            <Icon name="currency-inr" size={14} color={COLORS.ACCENT} />
            <Text style={styles.infoText}>{ratePerMinute}/min</Text>
          </View>
        </View>
    </LinearGradient>
  );

  const renderVideoCall = () => {
    const showLocalAsMain = isLocalMain;
    
    return (
      <View style={styles.fullScreen}>
        {/* --- MAIN FULL SCREEN VIEW --- */}
        <View style={styles.fullScreen}>
           {showLocalAsMain ? (
               // Local is Main
               isVideoOn ? (
                   <RtcSurfaceView style={styles.fullScreen} canvas={{ uid: 0, renderMode: 1 }} />
               ) : (
                   <View style={styles.placeholder}>
                       <Icon name="camera-off" size={60} color="rgba(255,255,255,0.3)" />
                       <Text style={styles.waitText}>Your Camera is Off</Text>
                   </View>
               )
           ) : (
               // Remote is Main
               remoteUid ? (
                   <RtcSurfaceView style={styles.fullScreen} canvas={{ uid: remoteUid, renderMode: 1 }} />
               ) : (
                   <LinearGradient colors={[COLORS.BG, COLORS.BG_GRADIENT]} style={styles.placeholder}>
                       <View style={styles.loadingRing}>
                           <ActivityIndicator size="large" color={COLORS.ACCENT} />
                       </View>
                       <Text style={styles.waitText}>Waiting for {userName}...</Text>
                   </LinearGradient>
               )
           )}
        </View>

        {/* --- PROFESSIONAL TOP OVERLAY --- */}
        <LinearGradient 
           colors={['rgba(0,0,0,0.7)', 'transparent']} 
           style={styles.topOverlay}
           pointerEvents="none" 
        >
           <SafeAreaView style={styles.topHeaderContent}>
              <View style={styles.timerPill}>
                 <Icon name="clock-outline" size={14} color="#FFF" style={{ marginRight: 6 }} />
                 <Text style={styles.timerText}>{formatTime(remainingTime)}</Text>
              </View>

              <View style={styles.remoteInfo}>
                 <Text style={styles.remoteName}>{userName}</Text>
                 <View style={styles.remoteStatusContainer}>
                    <View style={[styles.statusDot, { backgroundColor: !isWaitingForUser ? COLORS.SUCCESS : '#999' }]} />
                    <Text style={styles.remoteStatus}>{!isWaitingForUser ? 'Live' : 'Connecting'}</Text>
                 </View>
              </View>
           </SafeAreaView>
        </LinearGradient>

        {/* --- SMALL FLOATING VIEW (Bottom Right) --- */}
        {isEngineReady && (
           <TouchableOpacity 
               style={styles.smallVideoContainer} 
               onPress={() => setLocalMain(!isLocalMain)}
               activeOpacity={0.9}
           >
               {showLocalAsMain ? (
                   remoteUid ? (
                       <RtcSurfaceView style={styles.flex1} zOrderMediaOverlay={true} canvas={{ uid: remoteUid, renderMode: 1 }} />
                   ) : (
                       <View style={[styles.flex1, styles.placeholderSmall]}>
                           <ActivityIndicator size="small" color="#FFF" />
                       </View>
                   )
               ) : (
                   isVideoOn ? (
                       <RtcSurfaceView style={styles.flex1} zOrderMediaOverlay={true} canvas={{ uid: 0, renderMode: 1 }} />
                   ) : (
                       <View style={[styles.flex1, styles.placeholderSmall]}>
                           <Icon name="account" size={30} color="rgba(255,255,255,0.5)" />
                       </View>
                   )
               )}
           </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <ScreenWrapper backgroundColor="#000" barStyle="light-content" translucent={true} safeAreaTop={false} safeAreaBottom={false}>
      <View style={styles.flex1}>
         {callType === 'video' ? renderVideoCall() : renderAudioCall()}
      </View>
      
      {/* --- BOTTOM CONTROLS --- */}
      <View style={styles.controlsContainer}>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.controlsGradient}>
              <View style={styles.controls}>
                 <TouchableOpacity style={[styles.btn, !isMicOn && styles.btnOff]} onPress={() => { setMicOn(!isMicOn); AgoraEngine.setMic(!isMicOn); }}>
                    {/* Fixed: Icon color changes to BG when button background is white */}
                    <Icon name={isMicOn ? 'microphone' : 'microphone-off'} size={24} color={isMicOn ? COLORS.ACCENT : COLORS.BG} />
                 </TouchableOpacity>

                 <TouchableOpacity style={[styles.btn, !isSpeakerOn && styles.btnOff]} onPress={() => { setSpeakerOn(!isSpeakerOn); AgoraEngine.setSpeaker(!isSpeakerOn); }}>
                    {/* Fixed: Icon color changes to BG when button background is white */}
                    <Icon name={isSpeakerOn ? 'volume-high' : 'phone-in-talk'} size={24} color={isSpeakerOn ? COLORS.ACCENT : COLORS.BG} />
                 </TouchableOpacity>

                 {callType === 'video' && (
                   <>
                      <TouchableOpacity style={[styles.btn, !isVideoOn && styles.btnOff]} onPress={() => { setVideoOn(!isVideoOn); AgoraEngine.setVideo(!isVideoOn); }}>
                         <Icon name={isVideoOn ? 'video' : 'video-off'} size={24} color={isVideoOn ? COLORS.ACCENT : COLORS.BG} />
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.btn} onPress={() => AgoraEngine.switchCamera()}>
                         <Icon name="camera-flip" size={24} color={COLORS.ACCENT} />
                      </TouchableOpacity>
                   </>
                 )}

                 <TouchableOpacity style={styles.hangupBtn} onPress={handleEnd}>
                    <Icon name="phone-hangup" size={30} color="#FFF" />
                 </TouchableOpacity>
              </View>
          </LinearGradient>
      </View>
    </ScreenWrapper>
  );
};

export default CallScreen;