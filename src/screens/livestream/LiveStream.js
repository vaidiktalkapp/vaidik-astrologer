import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  ScrollView,
  Modal,
  FlatList,
  Animated,
  ActivityIndicator,
  AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
} from 'react-native-agora';
import { livestreamService } from '../../services/api/livestream.service';
import streamSocketService from '../../services/socket/streamSocketService'; // Check your import path
import { useAuth } from '../../contexts/AuthContext';

const { width, height } = Dimensions.get('window');

export default function LiveStreamScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { state } = useAuth();
  
  // Params from GoLiveSetupScreen
  const { 
    streamId, 
    channelName, 
    token, 
    uid, 
    appId, 
    title, 
    callSettings 
  } = route.params;

  // Refs
  const engineRef = useRef(null);
  const isInitialized = useRef(false);
  const controlsTimeout = useRef(null);
  const giftAnimValue = useRef(new Animated.Value(0)).current;

  // State
  const [isJoined, setIsJoined] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState(new Map());
  const [isLive, setIsLive] = useState(true); // Default true as we just went live
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  
  // Chat & Gifts
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [activeGifts, setActiveGifts] = useState([]);

  // Call Management
  const [callWaitlist, setCallWaitlist] = useState([]);
  const [currentCall, setCurrentCall] = useState(null);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [showCallSettingsModal, setShowCallSettingsModal] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [isCallTimerActive, setIsCallTimerActive] = useState(false);

  // UI
  const [showControls, setShowControls] = useState(true);

  // User Info
  const userName = state.astrologer?.name || state.user?.name || 'Astrologer';
  const userId = state.astrologer?._id || state.user?._id;

  // ==================== LIFECYCLE ====================

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const init = async () => {
      await initializeAgora();
      await connectSocket();
      // Note: We do NOT call startStream() because goLive() already did it.
    };
    init();

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      if (streamSocketService.socket?.connected) {
        streamSocketService.socket.emit('stream_heartbeat', { streamId });
      }
    }, 10000);

    return () => {
      isInitialized.current = false;
      clearInterval(heartbeatInterval);
      cleanup();
    };
  }, []);

  // Handle App Backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'background' && isLive) {
        // Optional: You might want to keep stream running or end it
        // endStream(); 
      }
    });
    return () => subscription.remove();
  }, [isLive]);

  // Call Timer
  useEffect(() => {
    let interval;
    if (isCallTimerActive && currentCall) {
      interval = setInterval(() => setCallTimer(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isCallTimerActive, currentCall]);

  // ==================== AGORA SETUP ====================

  const initializeAgora = async () => {
    try {
      console.log('🎥 Initializing Agora...');
      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: appId,
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      });

      engine.registerEventHandler({
        onJoinChannelSuccess: (connection) => {
          console.log('✅ Joined Agora Channel');
          setIsJoined(true);
        },
        onUserJoined: (_conn, remoteUid) => {
          console.log('👤 User Joined:', remoteUid);
          setRemoteUsers(prev => new Map(prev).set(remoteUid, remoteUid));

          // If we are waiting for a caller, match the UID
          setCurrentCall(prev => {
            if (prev?.isOnCall && (!prev.callerAgoraUid || prev.callerAgoraUid === 0)) {
              console.log('🔗 Linking pending call to UID:', remoteUid);
              return { ...prev, callerAgoraUid: remoteUid };
            }
            return prev;
          });
        },
        onUserOffline: (_conn, remoteUid) => {
          console.log('👋 User Offline:', remoteUid);
          setRemoteUsers(prev => {
            const newMap = new Map(prev);
            newMap.delete(remoteUid);
            return newMap;
          });

          // Auto-end call if caller leaves
          setCurrentCall(prev => {
            if (prev?.callerAgoraUid === remoteUid) {
              Alert.alert('Call Ended', 'User disconnected');
              endCurrentCall(); // Cleanup logic
              return null;
            }
            return prev;
          });
        },
        onError: (err, msg) => console.error('❌ Agora Error:', err, msg),
      });

      await engine.enableVideo();
      await engine.enableAudio();
      await engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      await engine.enableLocalVideo(true);
      await engine.startPreview();
      
      await engine.joinChannel(token, channelName, uid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: true,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });

    } catch (error) {
      console.error('❌ Agora Init Failed:', error);
      Alert.alert('Error', 'Failed to initialize video engine');
    }
  };

  const connectSocket = async () => {
    try {
      await streamSocketService.connect(streamId, userId, userName, true);
      
      // Listeners
      streamSocketService.onNewComment(handleNewComment);
      streamSocketService.onViewerCountUpdated((data) => setViewerCount(data.count));
      
      streamSocketService.onCallRequestReceived((data) => {
        console.log('📞 Call Request:', data);
        setCallWaitlist(prev => {
          if (prev.find(r => r.userId === data.userId)) return prev;
          return [...prev, { ...data, requestedAt: new Date() }];
        });
        Alert.alert('New Call Request', `${data.userName} wants to join!`);
      });

      streamSocketService.socket.on('call_request_cancelled', (data) => {
      console.log('❌ Request Cancelled:', data.userId);
      setCallWaitlist(prev => prev.filter(r => r.userId !== data.userId));
    });

    streamSocketService.socket.on('user_ended_call', () => {
      Alert.alert('Call Ended', 'User disconnected.');
      // Logic to reset host view
      setCurrentCall(null);
      setIsCallTimerActive(false);
      setCallTimer(0);
    });

    } catch (error) {
      console.error('❌ Socket Error:', error);
    }
  };

  const cleanup = async () => {
    if (engineRef.current) {
      await engineRef.current.leaveChannel();
      engineRef.current.release();
      engineRef.current = null;
    }
    streamSocketService.disconnect();
  };

  // ==================== ACTIONS ====================

  const handleEndStream = () => {
    Alert.alert('End Stream', 'Are you sure you want to end the live stream?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Stream', style: 'destructive', onPress: performEndStream }
    ]);
  };

  const performEndStream = async () => {
    try {
      await livestreamService.endStream(streamId);
      navigation.replace('StreamAnalytics', { streamId });
    } catch (error) {
      console.error('End Stream Error:', error);
      // Even if API fails, navigate away
      navigation.replace('StreamAnalytics', { streamId });
    }
  };

  const toggleMic = async () => {
    const newState = !isMicEnabled;
    setIsMicEnabled(newState);
    engineRef.current?.muteLocalAudioStream(!newState);
    // Optional: Notify backend/socket if needed
  };

  const toggleCamera = async () => {
    const newState = !isCameraEnabled;
    setIsCameraEnabled(newState);
    engineRef.current?.muteLocalVideoStream(!newState);
  };

  const switchCamera = () => {
    engineRef.current?.switchCamera();
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    streamSocketService.sendComment(streamId, userId, userName, state.astrologer?.profilePicture, chatInput.trim());
    setChatInput('');
  };

  // ==================== CALL LOGIC ====================

  const acceptCall = async (request) => {
    try {
      console.log('✅ Accepting:', request);
      const response = await livestreamService.acceptCallRequest(streamId, request.userId);

      if (response.success) {
        // 1. Remove from waitlist
        setCallWaitlist(prev => prev.filter(r => r.userId !== request.userId));

        // 2. Determine Caller UID (Backend provides the Agora UID user WILL use)
        const callerUid = response.data.uid || response.data.callerAgoraUid;

        // 3. Update State
        setCurrentCall({
          userId: request.userId,
          userName: request.userName,
          callType: request.callType,
          callMode: request.callMode,
          isOnCall: true,
          callerAgoraUid: callerUid,
          startedAt: new Date(),
        });

        // 4. Notify Viewers & User via Socket
        streamSocketService.notifyCallAccepted(
          streamId,
          request.userId,
          request.userName,
          request.callType,
          request.callMode,
          callerUid
        );

        setCallTimer(0);
        setIsCallTimerActive(true);
        setShowWaitlistModal(false);
      }
    } catch (error) {
      console.error('Accept Call Error:', error);
      Alert.alert('Error', 'Could not accept call. ' + (error.response?.data?.message || ''));
    }
  };

  const rejectCall = async (request) => {
    try {
      await livestreamService.rejectCallRequest(streamId, request.userId);
      setCallWaitlist(prev => prev.filter(r => r.userId !== request.userId));
      streamSocketService.notifyCallRejected(streamId, request.userId);
    } catch (error) {
      Alert.alert('Error', 'Failed to reject call');
    }
  };

  const endCurrentCall = async () => {
    if (!currentCall) return;

    try {
      const response = await livestreamService.endCurrentCall(streamId);
      
      const charge = response.data?.charge || 0;
      const duration = callTimer;

      streamSocketService.notifyCallEnded(streamId, duration, charge);
      
      Alert.alert('Call Ended', `Duration: ${formatCallDuration(duration)}\nEarned: ₹${charge}`);
    } catch (error) {
      console.error('End Call Error:', error);
    } finally {
      // Always cleanup local state
      setCurrentCall(null);
      setIsCallTimerActive(false);
      setCallTimer(0);
    }
  };

  // ==================== UI HELPERS ====================

  const handleNewComment = (data) => {
    setMessages(prev => [...prev, { ...data, id: Date.now().toString(), type: 'comment' }]);
  };

  const formatCallDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleControls = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 4000);
  };

  // ==================== RENDER ====================

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      {/* 1. VIDEO LAYER */}
      <TouchableOpacity activeOpacity={1} onPress={toggleControls} style={styles.videoContainer}>
        
        {/* Case A: Split Screen (Video Call) */}
        {currentCall && currentCall.callType === 'video' ? (
          <View style={styles.splitScreen}>
            {/* Host (Me) */}
            <View style={styles.videoHalf}>
              {isCameraEnabled ? (
                <RtcSurfaceView style={styles.fullVideo} canvas={{ uid: 0 }} renderMode={1} />
              ) : (
                <View style={styles.noVideo}><Text style={styles.noVideoText}>Camera Off</Text></View>
              )}
              <View style={styles.nameTag}><Text style={styles.nameText}>You</Text></View>
            </View>

            {/* Caller (Remote) */}
            <View style={styles.videoHalf}>
              {currentCall.callerAgoraUid && remoteUsers.has(currentCall.callerAgoraUid) ? (
                <RtcSurfaceView 
                  style={styles.fullVideo} 
                  canvas={{ uid: currentCall.callerAgoraUid }} 
                  zOrderMediaOverlay={true} 
                  renderMode={1}
                />
              ) : (
                <View style={styles.noVideo}>
                  <ActivityIndicator color="#FFB300" size="large" />
                  <Text style={styles.noVideoText}>Waiting for {currentCall.userName}...</Text>
                </View>
              )}
              <View style={styles.nameTag}><Text style={styles.nameText}>{currentCall.userName}</Text></View>
            </View>
          </View>
        ) : (
          // Case B: Full Screen (Streaming)
          <View style={styles.fullScreenVideo}>
            {isJoined && isCameraEnabled ? (
              <RtcSurfaceView style={styles.fullVideo} canvas={{ uid: 0 }} renderMode={1} />
            ) : (
              <View style={styles.noVideo}>
                <Icon name="videocam-off" size={60} color="#666" />
                <Text style={styles.noVideoText}>Camera Off</Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* 2. OVERLAYS */}
      
      {/* Active Call Card */}
      {currentCall && (
        <View style={styles.callCard}>
          <View style={styles.callCardContent}>
            <View style={styles.callAvatar}>
              <Text style={styles.callAvatarText}>{currentCall.userName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.callUser}>{currentCall.userName}</Text>
              <Text style={styles.callType}>
                {currentCall.callType === 'video' ? '📹 Video Call' : '📞 Voice Call'} • ₹{Math.floor(callTimer/60) * (currentCall.callType==='video' ? callSettings?.videoCallPrice : callSettings?.voiceCallPrice)}
              </Text>
            </View>
            <View style={styles.timerBadge}>
              <View style={styles.redDot} />
              <Text style={styles.timerText}>{formatCallDuration(callTimer)}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.endCallBar} onPress={endCurrentCall}>
            <Text style={styles.endCallText}>END CALL</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top Controls */}
      {showControls && (
        <View style={styles.topBar}>
          <View style={styles.liveTag}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.viewersTag}>
            <Icon name="visibility" color="#FFF" size={16} />
            <Text style={styles.viewerText}>{viewerCount}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.closeBtn} onPress={handleEndStream}>
            <Icon name="close" color="#FFF" size={24} />
          </TouchableOpacity>
        </View>
      )}

      {/* Gift Animations */}
      {activeGifts.map(g => (
        <Animated.View key={g.id} style={[styles.giftAnim, { opacity: giftAnimValue }]}>
          <Text style={{ fontSize: 40 }}>🎁</Text>
          <Text style={styles.giftText}>{g.userName} sent a gift!</Text>
        </Animated.View>
      ))}

      {/* Chat Messages */}
      <View style={styles.chatArea}>
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          inverted // Show new messages at bottom (if data is reversed, else standard)
          renderItem={({ item }) => (
            <View style={styles.chatBubble}>
              <Text style={styles.chatUser}>{item.userName}</Text>
              <Text style={styles.chatMsg}>
                {item.type === 'gift' ? `sent ${item.giftName} 🎁` : item.message}
              </Text>
            </View>
          )}
          style={{ maxHeight: 200 }}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TextInput 
          style={styles.chatInput} 
          placeholder="Say something..." 
          placeholderTextColor="#DDD"
          value={chatInput}
          onChangeText={setChatInput}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Icon name="send" color="#FFF" size={20} />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleMic} style={[styles.controlBtn, !isMicEnabled && styles.btnDisabled]}>
          <Icon name={isMicEnabled ? "mic" : "mic-off"} size={24} color="#FFF" />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={toggleCamera} style={[styles.controlBtn, !isCameraEnabled && styles.btnDisabled]}>
          <Icon name={isCameraEnabled ? "videocam" : "videocam-off"} size={24} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowWaitlistModal(true)} style={styles.waitlistBtn}>
          <Icon name="list" size={24} color="#FFF" />
          {callWaitlist.length > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{callWaitlist.length}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {/* 3. MODALS */}
      
      {/* Waitlist Modal */}
      <Modal visible={showWaitlistModal} transparent animationType="slide" onRequestClose={() => setShowWaitlistModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Call Requests ({callWaitlist.length})</Text>
            <FlatList
              data={callWaitlist}
              keyExtractor={item => item.userId}
              renderItem={({ item, index }) => (
                <View style={styles.waitlistItem}>
                  <View>
                    <Text style={styles.waitlistName}>{index+1}. {item.userName}</Text>
                    <Text style={styles.waitlistDetail}>{item.callType} • {item.callMode}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => rejectCall(item)} style={[styles.actionSmallBtn, { backgroundColor: '#FFEBEE' }]}>
                      <Icon name="close" color="#D32F2F" size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => acceptCall(item)} style={[styles.actionSmallBtn, { backgroundColor: '#E8F5E9' }]}>
                      <Icon name="check" color="#388E3C" size={20} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>No requests yet.</Text>}
            />
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowWaitlistModal(false)}>
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  
  // Video
  videoContainer: { flex: 1 },
  fullScreenVideo: { flex: 1 },
  splitScreen: { flex: 1, flexDirection: 'column' },
  videoHalf: { flex: 1, backgroundColor: '#222', borderBottomWidth: 1, borderColor: '#333' },
  fullVideo: { flex: 1 },
  noVideo: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noVideoText: { color: '#888', marginTop: 10 },
  nameTag: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 4 },
  nameText: { color: '#FFF', fontSize: 12 },

  // Top Bar
  topBar: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  liveTag: { backgroundColor: '#D32F2F', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 10 },
  liveText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  viewersTag: { backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', padding: 6, borderRadius: 4, alignItems: 'center' },
  viewerText: { color: '#FFF', marginLeft: 6, fontSize: 12 },
  closeBtn: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 },

  // Call Card
  callCard: { position: 'absolute', top: 60, left: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, overflow: 'hidden', zIndex: 5 },
  callCardContent: { flexDirection: 'row', padding: 10, alignItems: 'center' },
  callAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#673AB7', justifyContent: 'center', alignItems: 'center' },
  callAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  callUser: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  callType: { color: '#666', fontSize: 12 },
  timerBadge: { backgroundColor: '#E8F5E9', padding: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  redDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'red', marginRight: 6 },
  timerText: { color: 'green', fontWeight: 'bold', fontSize: 12 },
  endCallBar: { backgroundColor: '#D32F2F', padding: 8, alignItems: 'center' },
  endCallText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

  // Chat Area
  chatArea: { position: 'absolute', bottom: 80, left: 10, right: 10, height: 200, justifyContent: 'flex-end' },
  chatBubble: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 6, maxWidth: '80%' },
  chatUser: { color: '#FFB300', fontWeight: 'bold', fontSize: 12, marginBottom: 2 },
  chatMsg: { color: '#FFF', fontSize: 14 },

  // Bottom Bar
  bottomBar: { position: 'absolute', bottom: 20, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, color: '#FFF', marginRight: 10 },
  sendBtn: { backgroundColor: '#673AB7', padding: 10, borderRadius: 20, marginRight: 10 },
  controlBtn: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 20, marginRight: 10 },
  btnDisabled: { backgroundColor: '#D32F2F' },
  waitlistBtn: { backgroundColor: '#FFB300', padding: 10, borderRadius: 20 },
  badge: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  // Animations
  giftAnim: { position: 'absolute', alignSelf: 'center', top: '40%', alignItems: 'center', zIndex: 20 },
  giftText: { color: '#FFB300', fontWeight: 'bold', fontSize: 18, marginTop: 5, textShadowColor: 'black', textShadowRadius: 2 },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#000' },
  waitlistItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#EEE' },
  waitlistName: { fontWeight: 'bold', color: '#000', fontSize: 16 },
  waitlistDetail: { color: '#666', fontSize: 12 },
  actionSmallBtn: { padding: 8, borderRadius: 20 },
  closeModalBtn: { marginTop: 20, padding: 15, backgroundColor: '#EEE', borderRadius: 10, alignItems: 'center' },
  closeModalText: { fontWeight: 'bold', color: '#333' },
});