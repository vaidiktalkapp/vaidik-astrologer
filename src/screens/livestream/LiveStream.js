import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Animated,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import ScreenWrapper from '../../component/ScreenWrapper';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
} from 'react-native-agora';
import { livestreamService } from '../../services/api/livestream.service';
import { streamSocketService } from '../../services/socket/streamSocketService';
import { useAuth } from '../../contexts/AuthContext';
import { styles } from '../../style/LiveStreamStyle';
import { astrologerService } from '../../services/api/astrologer.service';
import { KeyboardProvider, KeyboardStickyView } from 'react-native-keyboard-controller';

export default function LiveStreamScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { astrologer, state } = useAuth();

  const activeUser = astrologer || state?.user;
  const userName = activeUser?.name || 'Astrologer';
  const userId = activeUser?._id || activeUser?.id;
  
  const { 
    streamId, 
    channelName, 
    token, 
    uid, 
    appId, 
    title
  } = route.params;

  const engineRef = useRef(null);
  const isSocketConnected = useRef(false); 
  const giftAnimValue = useRef(new Animated.Value(0)).current;

  const [isJoined, setIsJoined] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState(new Map());
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [activeGifts, setActiveGifts] = useState([]);

  const [callWaitlist, setCallWaitlist] = useState([]);
  
  // Call State
  const [currentCall, setCurrentCall] = useState(null);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [callTimer, setCallTimer] = useState(0); // This will now count DOWN
  const [isCallTimerActive, setIsCallTimerActive] = useState(false);

  const [showControls, setShowControls] = useState(true);
  const [callEndTime, setCallEndTime] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert('End Stream', 'Do you want to end the live stream?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'End', style: 'destructive', onPress: performEndStream }
        ]);
        return true; 
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    if (!userId) {
        console.log("⏳ Waiting for User ID...");
        return;
    }

    if (isSocketConnected.current) return;
    
    console.log("🚀 Initializing Stream for Host:", userId);
    isSocketConnected.current = true;

    const init = async () => {
      await initializeAgora();
      await connectSocket();
    };
    init();

    const heartbeatInterval = setInterval(() => {
      if (streamSocketService.isConnected()) {
        streamSocketService.socket.emit('stream_heartbeat', { streamId });
      }
    }, 10000);

    return () => {
      isSocketConnected.current = false;
      clearInterval(heartbeatInterval);
      cleanup();
    };
  }, [userId]); 

  // ✅ FIX: Timer Logic (Counts Down)
  useEffect(() => {
  let interval;
  if (isCallTimerActive && callEndTime) {
    interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((callEndTime - now) / 1000));
      
      setCallTimer(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        console.log("⏰ Timer expired. Ending call.");
        endCurrentCall();
      }
    }, 500); // Check twice a second for accuracy
  }
  return () => clearInterval(interval);
}, [isCallTimerActive, callEndTime]);

  const initializeAgora = async () => {
    try {
      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: appId,
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      });

      engine.registerEventHandler({
        onJoinChannelSuccess: () => setIsJoined(true),
        onUserJoined: (_conn, remoteUid) => {
          setRemoteUsers(prev => new Map(prev).set(remoteUid, remoteUid));
          setCurrentCall(prev => {
            if (prev?.isOnCall && (!prev.callerAgoraUid || prev.callerAgoraUid === 0)) {
               return { ...prev, callerAgoraUid: remoteUid };
            }
            return prev;
          });
        },
        onUserOffline: (_conn, remoteUid) => {
          setRemoteUsers(prev => {
            const newMap = new Map(prev);
            newMap.delete(remoteUid);
            return newMap;
          });
          setCurrentCall(prev => {
            if (prev?.callerAgoraUid === remoteUid) {
              endCurrentCall(); 
              return null;
            }
            return prev;
          });
        },
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
      console.error('Agora Error', error);
    }
  };

  const connectSocket = async () => {
    if (!userId) return; 

    try {
      await streamSocketService.connect(streamId, userId, userName, true);
      
      streamSocketService.onNewComment(handleNewComment);
      streamSocketService.onViewerCountUpdated((data) => setViewerCount(data.count));
      
      streamSocketService.onNewGift && streamSocketService.onNewGift((data) => {
          const giftId = Date.now();
          setActiveGifts(prev => [...prev, { ...data, id: giftId }]);
          Animated.sequence([
              Animated.timing(giftAnimValue, { toValue: 1, duration: 500, useNativeDriver: true }),
              Animated.delay(2000),
              Animated.timing(giftAnimValue, { toValue: 0, duration: 500, useNativeDriver: true })
          ]).start(() => {
              setActiveGifts(prev => prev.filter(g => g.id !== giftId));
          });
          setMessages(prev => [...prev, { ...data, type: 'gift', message: `received ${data.giftName}`, id: Date.now() }]);
      });

      streamSocketService.onCallRequestReceived((data) => {
        setCallWaitlist(prev => {
          if (prev.find(r => r.userId === data.userId)) return prev;
          return [...prev, { ...data, requestedAt: new Date() }];
        });
        Alert.alert("New Call Request", `${data.userName} wants to join!`);
      });

      streamSocketService.socket.on('call_request_cancelled', (data) => {
        setCallWaitlist(prev => prev.filter(r => r.userId !== data.userId));
        setCurrentCall(prevCall => {
            if (prevCall && prevCall.userId === data.userId) {
                Alert.alert('Call Cancelled', 'User cancelled.');
                // Mute remote audio just in case
                if(prevCall.callerAgoraUid && engineRef.current) {
                   engineRef.current.muteRemoteAudioStream(prevCall.callerAgoraUid, true);
                }
                setIsCallTimerActive(false);
                setCallTimer(0);
                return null; 
            }
            return prevCall;
        });
      });

      streamSocketService.socket.on('user_ended_call', () => {
        Alert.alert('Call Ended', 'User disconnected.');
        // Mute remote audio immediately
        if (currentCall?.callerAgoraUid && engineRef.current) {
             engineRef.current.muteRemoteAudioStream(currentCall.callerAgoraUid, true);
        }
        setCurrentCall(null);
        setIsCallTimerActive(false);
        setCallTimer(0);
      });

    } catch (error) {
      console.error('Socket Error:', error);
    }
  };

  const cleanup = async () => {
    if (engineRef.current) {
      try {
        await engineRef.current.leaveChannel();
        engineRef.current.release();
      } catch (e) {}
    }
    streamSocketService.disconnect();
  };

  const handleEndStream = () => {
    Alert.alert('End Stream', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: performEndStream }
    ]);
  };

  const performEndStream = async () => {
    try {
      await livestreamService.endStream(streamId);
      navigation.replace('Home');
    } catch (error) {
      navigation.replace('Home');
    }
  };

  const toggleMic = () => {
    const newState = !isMicEnabled;
    setIsMicEnabled(newState);
    engineRef.current?.muteLocalAudioStream(!newState);
  };

  const toggleCamera = () => {
    const newState = !isCameraEnabled;
    setIsCameraEnabled(newState);
    engineRef.current?.muteLocalVideoStream(!newState);
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    streamSocketService.sendComment(streamId, userId, userName, activeUser?.profilePicture, chatInput.trim());
    setChatInput('');
  };

  const handleNewComment = (data) => {
    setMessages(prev => [...prev, { ...data, id: Date.now().toString(), type: 'comment' }]);
  };

  const acceptCall = async (request) => {
    if (currentCall) {
      Alert.alert('Busy', 'Please end current call.');
      return;
    }
    
    try {
      const response = await livestreamService.acceptCallRequest(streamId, request.userId);
      
      if (response.success) {
        const callData = response.data;
        
        setCallWaitlist(prev => prev.filter(r => r.userId !== request.userId));
        
        // ✅ FIX: Use maxDuration from backend
        const maxDuration = callData.maxDuration || 600;
        const calculatedEndTime = Date.now() + (maxDuration * 1000);
        setCallEndTime(calculatedEndTime);

        setCurrentCall({
          userId: request.userId,
          userName: request.userName,
          callType: request.callType,
          callMode: request.callMode,
          isOnCall: true,
          callerAgoraUid: callData.callerAgoraUid,
          startedAt: new Date(),
        });
        
        // Notify user with socket
        streamSocketService.socket.emit('call_accepted', {
          streamId,
          userId: request.userId,
          userName: request.userName,
          callType: request.callType,
          callMode: request.callMode,
          token: callData.token, 
          channelName: callData.channelName, 
          callerAgoraUid: callData.callerAgoraUid, 
          hostAgoraUid: callData.hostAgoraUid,
          maxDuration: maxDuration // Pass duration to user
        });
        
        // ✅ FIX: Start Timer counting DOWN
        setCallTimer(maxDuration);
        setIsCallTimerActive(true);
        setShowWaitlistModal(false);
      }
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message;
      Alert.alert('Error', 'Accept failed: ' + errMsg);
    }
  };

  const rejectCall = async (request) => {
    try {
      await livestreamService.rejectCallRequest(streamId, request.userId);
      setCallWaitlist(prev => prev.filter(r => r.userId !== request.userId));
      streamSocketService.notifyCallRejected(streamId, request.userId);
    } catch (error) {
      Alert.alert('Error', 'Failed to reject');
    }
  };

  const endCurrentCall = async () => {
    if (!currentCall) return;

    // ✅ FIX: Immediately Mute Remote Audio
    // This prevents the "voice still going" issue if the user stays in channel
    if (currentCall.callerAgoraUid && engineRef.current) {
        engineRef.current.muteRemoteAudioStream(currentCall.callerAgoraUid, true);
    }

    try {
      const response = await livestreamService.endCurrentCall(streamId);
      const charge = response.data?.charge || 0;
      
      // ✅ NOTE: Backend now handles 'call_ended' emit, so we don't duplicate it here.
      // But we can show the alert.
      Alert.alert('Call Ended', `Duration: ${Math.floor((callTimer)/60)}m left\nEarned: ₹${charge}`);
    
    } catch (error) {
      console.error('End Call Error', error);
    } finally {
      setCurrentCall(null);
      setIsCallTimerActive(false);
      setCallTimer(0);
      setCallEndTime(null);
    }
  };

  const handleCommentLongPress = (comment) => {
    Alert.alert(
      "Manage Viewer",
      `${comment.userName}: ${comment.message || comment.comment}`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Report", 
          onPress: () => handleReportViewer(comment) 
        },
        { 
          text: "Block / Kick", 
          style: "destructive",
          onPress: () => handleBlockViewer(comment) 
        }
      ]
    );
  };

  const handleBlockViewer = (comment) => {
    Alert.alert(
      "Block Viewer",
      `Are you sure you want to block ${comment.userName}? They will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Block", 
          style: "destructive",
          onPress: async () => {
             try {
                await astrologerService.blockUser(comment.userId);
                Alert.alert("Blocked", "User blocked successfully.");
                
                // Optional: Remove their messages from local state immediately
                setMessages(prev => prev.filter(m => m.userId !== comment.userId));
             } catch (error) {
                Alert.alert("Error", "Could not block user.");
             }
          } 
        }
      ]
    );
  };

  const handleReportViewer = (comment) => {
     const reasons = ["Harassment", "Spam", "Inappropriate", "Other"];
     Alert.alert(
      "Report Reason",
      "Why are you reporting this?",
      reasons.map(r => ({
        text: r,
        onPress: async () => {
            try {
              await astrologerService.reportUser({
                reportedUserId: comment.userId,
                reason: r,
                entityType: 'livestream',
                entityId: streamId,
                description: `Comment: ${comment.message || comment.comment}`
              });
              Alert.alert("Reported", "Report submitted.");
            } catch(e) {
              Alert.alert("Error", "Failed to report.");
            }
        }
      })).concat([{text: "Cancel", style: "cancel"}])
     );
  };

return (
    // ✅ 1. Wrap with KeyboardProvider
    <KeyboardProvider statusBarTranslucent>
      <ScreenWrapper 
        backgroundColor="#000000" 
        barStyle="light-content" 
        translucent={true}
        safeAreaTop={false} 
        safeAreaBottom={false}
      >
        <View style={styles.container}> 
          
          {/* Main Content Area (Video + Overlay) */}
          <View style={{ flex: 1 }}>
            <TouchableOpacity activeOpacity={1} onPress={() => { setShowControls(!showControls); Keyboard.dismiss(); }} style={styles.videoContainer}>
                {currentCall && currentCall.callType === 'video' ? (
                <View style={styles.splitScreen}>
                    <View style={styles.videoHalf}>
                    {isCameraEnabled ? <RtcSurfaceView style={styles.fullVideo} canvas={{ uid: 0 }} renderMode={1} /> : <View style={styles.noVideo}><Text style={styles.noVideoText}>Camera Off</Text></View>}
                    </View>
                    <View style={styles.videoHalf}>
                    {currentCall.callerAgoraUid && remoteUsers.has(currentCall.callerAgoraUid) ? <RtcSurfaceView style={styles.fullVideo} canvas={{ uid: currentCall.callerAgoraUid }} zOrderMediaOverlay={true} renderMode={1} /> : <View style={styles.noVideo}><ActivityIndicator color="#FFB300" size="large" /></View>}
                    </View>
                </View>
                ) : (
                <View style={styles.fullScreenVideo}>
                    {isJoined && isCameraEnabled ? <RtcSurfaceView style={styles.fullVideo} canvas={{ uid: 0 }} renderMode={1} /> : <View style={styles.noVideo}><Text style={styles.noVideoText}>Camera Off</Text></View>}
                </View>
                )}
            </TouchableOpacity>

            {/* Gift Animations */}
            {(activeGifts || []).map(g => (
                <Animated.View key={g.id} style={[styles.giftAnim, { opacity: giftAnimValue }]}>
                <Text style={{ fontSize: 40 }}>🎁</Text>
                <Text style={styles.giftText}>{g.userName} sent {g.giftName}!</Text>
                </Animated.View>
            ))}

            {showControls && (
                <View style={styles.topBar}>
                <View style={styles.liveTag}><Text style={styles.liveText}>LIVE</Text></View>
                <View style={styles.viewersTag}><Icon name="visibility" color="#FFF" size={16} /><Text style={styles.viewerText}>{viewerCount}</Text></View>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.closeBtn} onPress={handleEndStream}><Icon name="close" color="#FFF" size={24} /></TouchableOpacity>
                </View>
            )}

            {/* Call Card */}
            {currentCall && (
                <View style={styles.callCard}>
                <View style={styles.callCardContent}>
                    <View style={styles.callAvatar}><Text style={styles.callAvatarText}>{currentCall.userName.charAt(0)}</Text></View>
                    <View style={{ flex: 1, marginLeft: 10 }}><Text style={styles.callUser}>{currentCall.userName}</Text><Text style={styles.callType}>{currentCall.callType}</Text></View>
                    <View style={styles.timerBadge}>
                        <View style={styles.redDot} />
                        <Text style={styles.timerText}>
                            {Math.floor(callTimer/60)}:{(callTimer%60).toString().padStart(2,'0')}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.endCallBar} onPress={endCurrentCall}><Text style={styles.endCallText}>END CALL</Text></TouchableOpacity>
                </View>
            )}

            {/* Chat Area */}
            <View style={styles.chatArea}>
                <FlatList
                data={messages || []}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                    activeOpacity={0.8}
                    onLongPress={() => handleCommentLongPress(item)}
                    delayLongPress={300}
                    >
                    <View style={styles.chatBubble}>
                        <Text style={styles.chatUser}>{item.userName}</Text>
                        <Text style={styles.chatMsg}>{item.comment || item.message}</Text>
                    </View>
                    </TouchableOpacity>
                )}
                style={{ maxHeight: 200 }}
                showsVerticalScrollIndicator={false}
                />
            </View>
          </View>

          {/* ✅ 2. Sticky Bottom Bar */}
          <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
            <View style={styles.bottomBar}>
                <TextInput 
                style={styles.chatInput} placeholder="Say something..." placeholderTextColor="#DDD"
                value={chatInput} onChangeText={setChatInput} onSubmitEditing={sendMessage}
                />
                <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}><Icon name="send" color="#FFF" size={20} /></TouchableOpacity>
                <TouchableOpacity onPress={toggleMic} style={[styles.controlBtn, !isMicEnabled && styles.btnDisabled]}><Icon name={isMicEnabled ? "mic" : "mic-off"} size={24} color="#FFF" /></TouchableOpacity>
                <TouchableOpacity onPress={toggleCamera} style={[styles.controlBtn, !isCameraEnabled && styles.btnDisabled]}><Icon name={isCameraEnabled ? "videocam" : "videocam-off"} size={24} color="#FFF" /></TouchableOpacity>
                <TouchableOpacity onPress={() => setShowWaitlistModal(true)} style={styles.waitlistBtn}>
                <Icon name="list" size={24} color="#FFF" />
                {callWaitlist.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{callWaitlist.length}</Text></View>}
                </TouchableOpacity>
            </View>
          </KeyboardStickyView>

        </View>

        {/* Modal */}
        <Modal visible={showWaitlistModal} transparent animationType="slide" onRequestClose={() => setShowWaitlistModal(false)}>
            <View style={styles.modalBg}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Call Requests ({callWaitlist.length})</Text>
                <FlatList
                data={callWaitlist}
                keyExtractor={item => item.userId}
                renderItem={({ item }) => (
                    <View style={styles.waitlistItem}>
                    <View><Text style={styles.waitlistName}>{item.userName}</Text><Text style={styles.waitlistDetail}>{item.callType}</Text></View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={() => rejectCall(item)} style={[styles.actionSmallBtn, { backgroundColor: '#FFEBEE' }]}><Icon name="close" color="#D32F2F" size={20} /></TouchableOpacity>
                        <TouchableOpacity onPress={() => acceptCall(item)} style={[styles.actionSmallBtn, { backgroundColor: '#E8F5E9' }]}><Icon name="check" color="#388E3C" size={20} /></TouchableOpacity>
                    </View>
                    </View>
                )}
                ListEmptyComponent={<Text style={{textAlign:'center', color:'#999', margin: 20}}>No requests</Text>}
                />
                <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowWaitlistModal(false)}><Text style={styles.closeModalText}>Close</Text></TouchableOpacity>
            </View>
            </View>
        </Modal>
      </ScreenWrapper>
    </KeyboardProvider>
  );
}
