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
import { useSession } from '../../contexts/SessionContext';

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
  const [isSpeakerOn, setSpeakerOn] = useState(true);
  const [isVideoOn, setVideoOn] = useState(callType === 'video');
  const [remoteUid, setRemoteUid] = useState(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isWaitingForUser, setIsWaitingForUser] = useState(true); // New state to show waiting status

  // ✅ REFS
  const remainingTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const { startSession, endSession } = useSession();

  useEffect(() => {
    startSession('call', route.params);
  }, []);

  // --- 1. BACK HANDLER ---
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
      return () => subscription.remove();
    }, [])
  );

  // --- 2. LOCAL TIMER LOGIC ---
  const startLocalTimer = (durationSeconds, initialElapsed = 0) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    // Timer definitely started now
    setIsWaitingForUser(false);

    remainingTimeRef.current = durationSeconds;
    elapsedRef.current = initialElapsed;
    
    setRemainingTime(durationSeconds);
    setElapsed(initialElapsed);

    timerIntervalRef.current = setInterval(() => {
      if (remainingTimeRef.current > 0) {
        remainingTimeRef.current -= 1;
        setRemainingTime(remainingTimeRef.current);
      } else {
        // Handle timeout locally if needed, usually backend sends end event
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

        // ✅ 1. LISTEN FOR CREDENTIALS TO START AGORA (Permissions flow)
        AstrologerCallSocket.on('call_credentials', async (payload) => {
             console.log('🔑 [ASTRO] Received credentials:', payload);
             if (payload.sessionId !== sessionId) return;
             
             // Init Agora immediately to handle permissions
             await initAgora({ ...payload, agoraAstrologerUid: payload.agoraUid });
             
             // ✅ Notify server we joined Agora (Pre-requisite for timer start)
             AstrologerCallSocket.emit('user_joined_agora', { 
                 sessionId, 
                 role: 'astrologer' 
             });
        });

        // ✅ 2. LISTEN FOR TIMER START (Only after both joined)
        AstrologerCallSocket.on('timer_start', (payload) => {
            console.log('⏰ [ASTRO] timer_start:', payload);
            if (payload.sessionId !== sessionId) return;
            startLocalTimer(payload.maxDurationSeconds, 0);
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
               // Ensure waiting screen is gone if we get ticks
               setIsWaitingForUser(false); 
            }
          }
        });

        AstrologerCallSocket.on('call_ended', () => {
          console.log('🛑 [ASTRO] call_ended received');
          endSession();
          cleanup();
          Alert.alert('Call Ended', 'The session has ended.', [
             { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }) }
          ]);
        });

        // Check if we missed the credentials (re-join flow)
        AstrologerCallSocket.emit('sync_timer', { sessionId }, async (res) => {
          if (res?.success) {
            console.log('🔄 [ASTRO] Manual sync success:', res.data);
            if (res.data.remainingSeconds > 0) {
               startLocalTimer(res.data.remainingSeconds, res.data.elapsedSeconds);
            }
            // If we are syncing, we might need credentials again if engine isn't ready
            // The gateway usually resends credentials on join if active
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
        
        // If permissions denied, we won't proceed, and 'user_joined_agora' won't be sent.
        // This effectively pauses the start sequence as requested.
        if (
            granted['android.permission.RECORD_AUDIO'] !== PermissionsAndroid.RESULTS.GRANTED ||
            (callType === 'video' && granted['android.permission.CAMERA'] !== PermissionsAndroid.RESULTS.GRANTED)
        ) {
            Alert.alert('Permissions Required', 'Please grant permissions to start the call.');
            return;
        }
      }
      
      await AgoraEngine.init(payload.agoraAppId);
      setIsEngineReady(true);
      
      AgoraEngine.registerEventHandler({
        onUserJoined: (channel, uid) => {
          console.log('👤 [ASTRO] USER JOINED AGORA:', uid);
          setRemoteUid(uid);
        },
        onUserOffline: () => {
          console.log('👋 [ASTRO] USER LEFT AGORA');
          setRemoteUid(null);
        },
      });

      const uid = Number(payload.agoraAstrologerUid); // Use correct field from credentials
      
      await AgoraEngine.join(
        payload.agoraToken,
        payload.agoraChannelName, 
        uid, 
        true // Enable audio/video based on type, usually we just publish what we have
      );

      // We explicitly set speaker based on type
      if (callType === 'video') {
           AgoraEngine.setSpeaker(true);
           setSpeakerOn(true);
      } else {
           AgoraEngine.setSpeaker(false); // Earpiece for audio by default usually
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

  const toggleSpeaker = async () => {
    try {
      const newSpeakerState = !isSpeakerOn;
      await AgoraEngine.setSpeaker(newSpeakerState);
      setSpeakerOn(newSpeakerState);
    } catch (error) {
      console.error('Failed to toggle speaker:', error);
    }
  };

  const handleEnd = () => {
    Alert.alert(
      'End Call', 
      'Are you sure you want to end this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Call',
          style: 'destructive',
          onPress: async () => {
            try {
              await CallService.endCall(sessionId, 'astrologer_ended');
              await endSession();
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
                 <Text style={styles.waitingText}>
                     {isWaitingForUser ? 'Waiting for user to join...' : 'Connecting video...'}
                 </Text>
               </LinearGradient>
             )}
             
             {/* TIMER OVERLAY FOR VIDEO */}
             {!isWaitingForUser && (
                 <View style={styles.videoTimerOverlay}>
                   <Icon name="clock-outline" size={14} color={COLORS.ACCENT} style={styles.clockIcon} />
                   <Text style={styles.videoTimerText}>{formatTime(remainingTime)}</Text>
                 </View>
             )}

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
              <View style={[styles.statusDot, isWaitingForUser && { backgroundColor: 'orange' }]} />
              <Text style={styles.status}>
                  {isWaitingForUser ? 'Connecting...' : 'In Progress'}
              </Text>
            </View>
            
            {!isWaitingForUser && (
                <View style={styles.timerCard}>
                  <Text style={styles.bigTimer}>{formatTime(remainingTime)}</Text>
                  <Text style={styles.subText}>TIME REMAINING</Text>
                </View>
            )}
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
  container: { flex: 1, backgroundColor: COLORS.BG },
  flex1: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  pulseRing1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: COLORS.ACCENT, opacity: 0.2 },
  pulseRing2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: COLORS.ACCENT, opacity: 0.3 },
  avatarRing: { padding: 5, borderRadius: 65, borderWidth: 3, borderColor: COLORS.ACCENT, backgroundColor: COLORS.PRIMARY, elevation: 8 },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: COLORS.BG_GRADIENT, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255, 193, 7, 0.1)' },
  avatarText: { fontSize: 48, color: COLORS.ACCENT, fontWeight: '700' },
  name: { fontSize: 30, color: '#FFF', fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.SURFACE, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: COLORS.BORDER, marginBottom: 40 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.ACCENT, marginRight: 6 },
  status: { color: COLORS.ACCENT, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  timerCard: { backgroundColor: COLORS.PRIMARY, paddingHorizontal: 40, paddingVertical: 24, borderRadius: 24, borderWidth: 2, borderColor: COLORS.ACCENT, alignItems: 'center', elevation: 8 },
  bigTimer: { fontSize: 56, fontWeight: '300', color: COLORS.ACCENT, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  subText: { color: 'rgba(255, 193, 7, 0.6)', fontSize: 11, letterSpacing: 2, fontWeight: '600', marginTop: 4 },
  localVideo: { position: 'absolute', top: 100, right: 20, width: 100, height: 140, borderRadius: 16, overflow: 'hidden', borderWidth: 2.5, borderColor: COLORS.ACCENT, backgroundColor: COLORS.PRIMARY, elevation: 6 },
  videoTimerOverlay: { position: 'absolute', top: 100, left: 20, backgroundColor: COLORS.PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.ACCENT, elevation: 4 },
  clockIcon: { marginRight: 6 },
  videoTimerText: { color: COLORS.ACCENT, fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 15 },
  loadingRing: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.PRIMARY, borderWidth: 2, borderColor: COLORS.ACCENT, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  waitingText: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 15, fontWeight: '500' },
  footer: { position: 'absolute', bottom: 40, width: '100%', flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingHorizontal: 20 },
  btn: { width: 62, height: 62, borderRadius: 31, backgroundColor: COLORS.PRIMARY, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.ACCENT, elevation: 4 },
  btnOff: { backgroundColor: COLORS.ACCENT, borderColor: COLORS.PRIMARY },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.DANGER, justifyContent: 'center', alignItems: 'center', elevation: 10, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.2)' },
});

export default CallScreen;