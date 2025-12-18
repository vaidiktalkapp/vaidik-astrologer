import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  StatusBar, 
  Platform, 
  PermissionsAndroid, 
  BackHandler 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RtcSurfaceView } from 'react-native-agora';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import CallService from '../../services/api/call/CallService';
import AstrologerCallSocket from '../../services/socket/AstrologerCallSocket';
import AgoraEngine from '../../services/agora/engine';
import { STORAGE_KEYS } from '../../config/constants';

const COLORS = {
  PRIMARY: '#372643',      // Logo dark purple
  ACCENT: '#FFC107',       // Yellow accent
  BG: '#1A1625',          // Deep purple-tinted background
  BG_GRADIENT: '#2D2438', // Lighter purple for gradients
  DANGER: '#FF453A',      // Keep red for end call
  SURFACE: 'rgba(255, 193, 7, 0.08)', // Yellow-tinted surface
  BORDER: 'rgba(255, 193, 7, 0.2)',   // Yellow border
};

const CallScreen = ({ route, navigation }) => {
  const { sessionId, userName = 'User', callType = 'audio', ratePerMinute = 10 } = route.params || {};

  // ✅ STATE
  const [remainingTime, setRemainingTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isMicOn, setMicOn] = useState(true);
  const [isSpeakerOn, setSpeakerOn] = useState(true); // ✅ NEW: Speaker state
  const [isVideoOn, setVideoOn] = useState(callType === 'video');
  const [remoteUid, setRemoteUid] = useState(null);
  const [isEngineReady, setIsEngineReady] = useState(false);

  // ✅ REFS (For stable timer access)
  const remainingTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const timerIntervalRef = useRef(null);

  // Calculate live earnings
  const currentEarnings = ((elapsed / 60) * ratePerMinute).toFixed(2);

  // --- 1. BACK HANDLER (Fixed Crash) ---
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert('End Call', 'Are you sure you want to end this session?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End Call', style: 'destructive', onPress: handleEnd }
        ]);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      
      return () => {
        subscription.remove();
      };
    }, [])
  );

  // --- 2. LOCAL TIMER LOGIC ---
  const startLocalTimer = (durationSeconds, initialElapsed = 0) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    remainingTimeRef.current = durationSeconds;
    elapsedRef.current = initialElapsed;
    
    setRemainingTime(durationSeconds);
    setElapsed(initialElapsed);

    timerIntervalRef.current = setInterval(() => {
      if (remainingTimeRef.current > 0) {
        remainingTimeRef.current -= 1;
        setRemainingTime(remainingTimeRef.current);
      }

      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  };

  // --- 3. MAIN SETUP ---
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

        AstrologerCallSocket.on('timer_start', async (payload) => {
            console.log('⏰ [ASTRO] timer_start:', payload);
            
            if (payload.sessionId !== sessionId) return;

            startLocalTimer(payload.maxDurationSeconds, 0);

            const astroUid = Number(payload.agoraAstrologerUid) || Number(payload.agoraUid);
            await initAgora({ ...payload, agoraAstrologerUid: astroUid });
            
            if (astrologer?._id) {
               AstrologerCallSocket.joinSession(sessionId, astrologer._id, 'astrologer');
            }
        });

        AstrologerCallSocket.on('timer_tick', (payload) => {
          if (payload.sessionId === sessionId) {
            const diff = Math.abs(remainingTimeRef.current - payload.remainingSeconds);
            if (diff > 2) {
               console.log('⚠️ [ASTRO] Syncing timer drift');
               remainingTimeRef.current = payload.remainingSeconds;
               elapsedRef.current = payload.elapsedSeconds;
               
               setRemainingTime(payload.remainingSeconds);
               setElapsed(payload.elapsedSeconds);
            }
          }
        });

        AstrologerCallSocket.on('call_ended', () => {
          console.log('🛑 [ASTRO] call_ended received');
          cleanup();
          Alert.alert('Call Ended', 'The session has ended.', [
             { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }) }
          ]);
        });

        AstrologerCallSocket.emit('sync_timer', { sessionId }, (res) => {
          if (res?.success) {
            console.log('🔄 [ASTRO] Manual sync success:', res.data);
            startLocalTimer(res.data.remainingSeconds, res.data.elapsedSeconds);
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
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA
        ]);
      }
      
      await AgoraEngine.init(payload.agoraAppId);
      setIsEngineReady(true);
      
      AgoraEngine.registerEventHandler({
        onUserJoined: (channel, uid) => {
          console.log('👤 [ASTRO] USER JOINED:', uid);
          setRemoteUid(uid);
        },
        onUserOffline: () => {
          console.log('👋 [ASTRO] USER LEFT');
          setRemoteUid(null);
        },
      });

      const uid = Number(payload.agoraAstrologerUid);
      if (isNaN(uid)) {
         console.error('❌ Invalid UID:', uid);
         return;
      }

      await AgoraEngine.join(
        payload.agoraToken,
        payload.agoraChannelName, 
        uid, 
        true
      );

    } catch (e) {
        console.error('❌ [ASTRO] Agora init failed:', e);
    }
  };

  const cleanup = async () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
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

  // ✅ NEW: Speaker toggle function
const toggleSpeaker = async () => {
  try {
    const newSpeakerState = !isSpeakerOn;
    // ✅ Use the wrapper method from your engine
    await AgoraEngine.setSpeaker(newSpeakerState);
    setSpeakerOn(newSpeakerState);
    console.log(`🔊 Speaker ${newSpeakerState ? 'ON' : 'OFF'}`);
  } catch (error) {
    console.error('Failed to toggle speaker:', error);
  }
};

  // ✅ UPDATED: Show confirmation alert before ending
  const handleEnd = () => {
    Alert.alert(
      'End Call', 
      'Are you sure you want to end this session?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'End Call',
          style: 'destructive',
          onPress: async () => {
            try {
              await CallService.endCall(sessionId, 'astrologer_ended');
              cleanup();
              navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            } catch (error) {
              console.error('Failed to end call:', error);
              Alert.alert('Error', 'Failed to end call. Please try again.');
            }
          }
        }
      ],
      { cancelable: false }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.BG} />
      

      {/* CONTENT */}
      <View style={styles.flex1}>
        {callType === 'video' ? (
          <View style={styles.flex1}>
             {isEngineReady && remoteUid ? (
               <RtcSurfaceView style={styles.flex1} canvas={{ uid: remoteUid, renderMode: 1 }} />
             ) : (
               <LinearGradient colors={[COLORS.BG, COLORS.BG_GRADIENT]} style={styles.center}>
                 <View style={styles.loadingRing}>
                   <Icon name="account" size={48} color={COLORS.ACCENT} />
                 </View>
                 <Text style={styles.waitingText}>Waiting for user video...</Text>
               </LinearGradient>
             )}
             
             {/* TIMER OVERLAY FOR VIDEO */}
             <View style={styles.videoTimerOverlay}>
               <Icon name="clock-outline" size={14} color={COLORS.ACCENT} style={styles.clockIcon} />
               <Text style={styles.videoTimerText}>{formatTime(remainingTime)}</Text>
             </View>

             {isEngineReady && isVideoOn && (
               <View style={styles.localVideo}>
                 <RtcSurfaceView style={styles.flex1} zOrderMediaOverlay={true} canvas={{ uid: 0, renderMode: 1 }} />
               </View>
             )}
          </View>
        ) : (
          <LinearGradient colors={[COLORS.BG, COLORS.BG_GRADIENT, COLORS.BG]} style={styles.center}>
            <View style={styles.avatarContainer}>
              <View style={styles.pulseRing1} />
              <View style={styles.pulseRing2} />
              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
                </View>
              </View>
            </View>
            
            <Text style={styles.name}>{userName}</Text>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.status}>In Progress</Text>
            </View>
            
            <View style={styles.timerCard}>
              <Text style={styles.bigTimer}>{formatTime(remainingTime)}</Text>
              <Text style={styles.subText}>TIME REMAINING</Text>
            </View>
          </LinearGradient>
        )}
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.btn, !isMicOn && styles.btnOff]} 
          onPress={() => { setMicOn(!isMicOn); AgoraEngine.setMic(!isMicOn); }}
        >
          <Icon name={isMicOn ? 'microphone' : 'microphone-off'} size={26} color={isMicOn ? COLORS.ACCENT : COLORS.PRIMARY} />
        </TouchableOpacity>
        
        {/* ✅ NEW: Speaker Toggle Button */}
        <TouchableOpacity 
          style={[styles.btn, !isSpeakerOn && styles.btnOff]} 
          onPress={toggleSpeaker}
        >
          <Icon 
            name={isSpeakerOn ? 'volume-high' : 'phone-in-talk'} 
            size={26} 
            color={isSpeakerOn ? COLORS.ACCENT : COLORS.PRIMARY} 
          />
        </TouchableOpacity>
        
        {callType === 'video' && (
          <TouchableOpacity style={styles.btn} onPress={() => AgoraEngine.switchCamera()}>
            <Icon name="camera-flip" size={26} color={COLORS.ACCENT} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.endBtn} onPress={handleEnd}>
          <Icon name="phone-hangup" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.BG 
  },
  flex1: { flex: 1 },
  center: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },

  // AUDIO UI
  avatarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32
  },
  pulseRing1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: COLORS.ACCENT,
    opacity: 0.2
  },
  pulseRing2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: COLORS.ACCENT,
    opacity: 0.3
  },
  avatarRing: { 
    padding: 5, 
    borderRadius: 65, 
    borderWidth: 3, 
    borderColor: COLORS.ACCENT,
    backgroundColor: COLORS.PRIMARY,
    shadowColor: COLORS.ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8
  },
  avatar: { 
    width: 110, 
    height: 110, 
    borderRadius: 55, 
    backgroundColor: COLORS.BG_GRADIENT, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 193, 7, 0.1)'
  },
  avatarText: { 
    fontSize: 48, 
    color: COLORS.ACCENT, 
    fontWeight: '700' 
  },
  name: { 
    fontSize: 30, 
    color: '#FFF', 
    fontWeight: '700', 
    marginBottom: 8,
    letterSpacing: 0.5 
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    marginBottom: 40
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.ACCENT,
    marginRight: 6
  },
  status: { 
    color: COLORS.ACCENT, 
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5
  },
  timerCard: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 40,
    paddingVertical: 24,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.ACCENT,
    alignItems: 'center',
    shadowColor: COLORS.ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8
  },
  bigTimer: { 
    fontSize: 56, 
    fontWeight: '300', 
    color: COLORS.ACCENT, 
    fontVariant: ['tabular-nums'],
    letterSpacing: 2
  },
  subText: { 
    color: 'rgba(255, 193, 7, 0.6)', 
    fontSize: 11, 
    letterSpacing: 2,
    fontWeight: '600',
    marginTop: 4
  },

  // VIDEO UI
  localVideo: { 
    position: 'absolute', 
    top: 100, 
    right: 20, 
    width: 100, 
    height: 140, 
    borderRadius: 16, 
    overflow: 'hidden', 
    borderWidth: 2.5, 
    borderColor: COLORS.ACCENT, 
    backgroundColor: COLORS.PRIMARY,
    shadowColor: COLORS.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6
  },
  videoTimerOverlay: { 
    position: 'absolute', 
    top: 100, 
    left: 20, 
    backgroundColor: COLORS.PRIMARY, 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.ACCENT,
    shadowColor: COLORS.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4
  },
  clockIcon: {
    marginRight: 6
  },
  videoTimerText: { 
    color: COLORS.ACCENT, 
    fontWeight: '700', 
    fontVariant: ['tabular-nums'],
    fontSize: 15
  },
  loadingRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.PRIMARY,
    borderWidth: 2,
    borderColor: COLORS.ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  waitingText: { 
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    fontWeight: '500'
  },

  // FOOTER
  footer: { 
    position: 'absolute', 
    bottom: 40, 
    width: '100%', 
    flexDirection: 'row', 
    justifyContent: 'space-evenly', 
    alignItems: 'center',
    paddingHorizontal: 20
  },
  btn: { 
    width: 62, 
    height: 62, 
    borderRadius: 31, 
    backgroundColor: COLORS.PRIMARY, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.ACCENT,
    shadowColor: COLORS.ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4
  },
  btnOff: { 
    backgroundColor: COLORS.ACCENT,
    borderColor: COLORS.PRIMARY
  },
  endBtn: { 
    width: 72, 
    height: 72, 
    borderRadius: 36, 
    backgroundColor: COLORS.DANGER, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: COLORS.DANGER,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
});

export default CallScreen;
