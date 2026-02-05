// src/screens/CallChatSection/AstroChatRoom.js

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  Clipboard,
  AppState,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
// ✅ Import from react-native-keyboard-controller
import { 
  KeyboardStickyView, 
  KeyboardProvider 
} from 'react-native-keyboard-controller';

import { useAuth } from '../../contexts/AuthContext';
import AstrologerChatSocket from '../../services/socket/AstrologerChatSocket';
import ChatService from '../../services/api/chat/ChatService';
import AudioMessageBubble from '../../component/chat/AudioMessageBubble';
import { useSession } from '../../contexts/SessionContext';
import { styles, COLORS } from '../../style/AstroChatRoomStyle';
import ScreenWrapper from '../../component/ScreenWrapper';
import { astrologerService } from '../../services/api/astrologer.service';

const AstroChatRoom = ({ route, navigation }) => {
  const { state: { astrologer } } = useAuth();
  const astrologerId = astrologer?._id || astrologer?.id;
  const { sessionId, orderId, userId } = route.params || {};
  const { startSession, endSession } = useSession();

  // State
  const [messages, setMessages] = useState([]); 
  const [input, setInput] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sessionStatus, setSessionStatus] = useState('waiting');
  const [userData, setUserData] = useState(null);
  const [showKundli, setShowKundli] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const flatListRef = useRef(null);
  const appState = useRef(AppState.currentState);

  // Format Time
  const formatTime = (seconds) => {
    if (seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  useEffect(() => {
    startSession('chat', route.params);
  }, []);

  // Format Message Helper
  const formatMessage = (msg) => {
    const type = msg.type || 'text';
    const mediaUrl = msg.fileUrl || msg.mediaUrl || msg.url || null;
    const isTextLike = type === 'text' || type === 'kundli_details';

    return {
      _id: msg.messageId || msg._id,
      text: isTextLike ? msg.content : '',
      isMe: msg.senderModel === 'Astrologer',
      timestamp: msg.sentAt || msg.createdAt,
      type,
      mediaUrl,
      thumbnailUrl: msg.thumbnailUrl || null,
      mimeType: msg.mimeType || null,
      fileDuration: msg.fileDuration || null,
      fileName: msg.fileName || null,
      fileSize: msg.fileSize || null,
      kundliDetails: msg.kundliDetails,
      senderModel: msg.senderModel,
    };
  };

  // ===== 1. LOAD DATA & CHECK STATUS =====
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const res = await ChatService.getConversationMessages(orderId, 1, 20);
      
      try {
        const timerRes = await ChatService.getTimerStatus(sessionId);
        if (timerRes && timerRes.success) {
           const { status, remainingSeconds, timerStatus } = timerRes.data;
           
           if (status === 'active' || timerStatus === 'running') {
             setIsActive(true);
             setSessionStatus('active');
             setSecondsLeft(remainingSeconds);
           } else if (status === 'ended') {
             setSessionStatus('ended');
             setIsActive(false);
           }
        }
      } catch (err) {
        console.log("⚠️ Could not sync timer status:", err.message);
      }

      let msgs = [];
      let meta = {};
      let pagination = {};

      if (res?.data) {
        msgs = res.data.messages || [];
        meta = res.data.meta || {};
        pagination = res.data.pagination || {};
      } else if (res?.messages) {
        msgs = res.messages;
        meta = res.meta || {};
        pagination = res.pagination || {};
      }

      const userMeta = meta?.user || {};
      if (userMeta && Object.keys(userMeta).length > 0) {
        setUserData({
          _id: userMeta._id,
          name: userMeta.name || 'User',
          profilePicture: userMeta.profilePicture || userMeta.profileImage,
          kundli: userMeta.kundli || {},
          privacy: userMeta.privacy || {},
        });
      }

      const formatted = msgs.map(formatMessage).reverse();
      setMessages(formatted);
      setPage(pagination.page || 1);
      setHasMore((pagination.page || 1) < (pagination.pages || 1));

    } catch (e) {
      console.error('❌ Error loading messages:', e);
    } finally {
      setIsLoading(false);
    }
  }, [orderId, sessionId]);

  const loadMoreMessages = async () => {
    if (!hasMore || isFetchingMore || isLoading) return;

    try {
      setIsFetchingMore(true);
      const nextPage = page + 1;
      
      const res = await ChatService.getConversationMessages(orderId, nextPage, 20);
      
      if (res?.data?.messages) {
        const newMessages = res.data.messages.map(formatMessage).reverse();
        setMessages((prev) => [...prev, ...newMessages]);
        setPage(res.data.pagination.page);
        setHasMore(res.data.pagination.page < res.data.pagination.pages);
      }
    } catch (error) {
      console.error('❌ Load more error:', error);
    } finally {
      setIsFetchingMore(false);
    }
  };

  // ===== 3. SOCKET & APP STATE =====
  useEffect(() => {
    let mounted = true;

    const initSocket = () => {
      AstrologerChatSocket.emit('join_session', { sessionId, userId: astrologerId, role: 'astrologer' });
      AstrologerChatSocket.emit('sync_timer', { sessionId });
    };

    initSocket();
    loadInitialData();

    AstrologerChatSocket.on('chat_message', (msg) => {
      if (msg.sessionId !== sessionId) return;
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg.messageId)) return prev;
        if (msg.senderModel === 'Astrologer') {
          const idx = prev.findIndex((m) => m.isMe && String(m._id).startsWith('temp-') && m.text === msg.content);
          if (idx > -1) {
            const newArr = [...prev];
            newArr[idx] = { ...newArr[idx], _id: msg.messageId, timestamp: msg.sentAt };
            return newArr;
          }
        }
        return [formatMessage(msg), ...prev];
      });
    });

    AstrologerChatSocket.on('timer_start', (data) => {
      if (data.sessionId === sessionId) {
        setIsActive(true);
        setSessionStatus('active');
        setSecondsLeft(data.maxDurationSeconds);
      }
    });

    AstrologerChatSocket.on('timer_tick', (data) => {
      if (data.remainingSeconds !== undefined) {
        setSecondsLeft(data.remainingSeconds);
        setIsActive((curr) => {
          if (!curr && data.remainingSeconds > 0) {
            setSessionStatus('active');
            return true;
          }
          return curr;
        });
      }
    });

    const handleEnd = () => {
      endSession();
      setIsActive(false);
      setSessionStatus('ended');
      Alert.alert('Ended', 'Session has ended.');
    };

    AstrologerChatSocket.on('timer_ended', handleEnd);
    AstrologerChatSocket.on('chat_ended', handleEnd);

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        initSocket();
        ChatService.getTimerStatus(sessionId).then(res => {
            if(res.success && res.data.remainingSeconds > 0) {
                setSecondsLeft(res.data.remainingSeconds);
                setIsActive(true);
                setSessionStatus('active');
            }
        });
      }
      appState.current = nextAppState;
    });

    return () => {
      mounted = false;
      subscription.remove();
      AstrologerChatSocket.off('chat_message');
      AstrologerChatSocket.off('timer_start');
      AstrologerChatSocket.off('timer_tick');
      AstrologerChatSocket.off('chat_ended');
      AstrologerChatSocket.off('timer_ended');
    };
  }, [sessionId, astrologerId, loadInitialData]);

  const handleOptionsPress = () => {
    Alert.alert("Chat Options", "Select an action", [
        { text: "Cancel", style: "cancel" },
        { text: "Report Abuse", onPress: () => showReportReasons() },
        { text: "Block User", style: "destructive", onPress: confirmBlockUser }
      ]
    );
  };

  const confirmBlockUser = () => {
    Alert.alert("Block User?", "You will no longer receive messages. Session will end.", [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: async () => {
            try {
              await astrologerService.blockUser(userData?._id || userId);
              AstrologerChatSocket.emit('end_chat', { sessionId, userId: astrologerId, reason: 'user_blocked' });
              Alert.alert("Blocked", "User blocked.");
              navigation.goBack();
            } catch (error) {
              Alert.alert("Error", error.message || "Failed to block user");
            }
          }
        }
      ]
    );
  };

  const showReportReasons = () => {
    const reasons = ["Harassment", "Inappropriate Content", "Spam", "Other"];
    Alert.alert("Report Reason", "Why are you reporting?",
      reasons.map(reason => ({ text: reason, onPress: () => submitReport(reason) })).concat([{ text: "Cancel", style: "cancel" }])
    );
  };

  const submitReport = async (reason) => {
    try {
      await astrologerService.reportUser({
        reportedUserId: userData?._id || userId,
        reason: reason,
        entityType: 'chat',
        entityId: sessionId,
        description: "Reported from chat screen"
      });
      Alert.alert("Reported", "Thank you.");
    } catch (error) {
      Alert.alert("Error", "Failed to submit report.");
    }
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const content = input.trim();
    setInput('');

    const tempId = `temp-${Date.now()}`;
    const tempMsg = {
        _id: tempId,
        text: content,
        isMe: true,
        timestamp: new Date().toISOString(),
        type: 'text',
    };

    setMessages((prev) => [tempMsg, ...prev]);

    AstrologerChatSocket.emit('send_message', {
      sessionId,
      orderId,
      senderId: astrologerId,
      senderModel: 'Astrologer',
      receiverId: userId,
      receiverModel: 'User',
      type: 'text',
      content,
    });
  };

  const endChat = useCallback(() => {
    Alert.alert('End Chat', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: async () => {
          AstrologerChatSocket.emit('end_chat', { sessionId, userId: astrologerId, reason: 'astrologer_ended' });
          await endSession();
          navigation.goBack();
        },
      },
    ]);
  }, [endSession, navigation, sessionId, astrologerId]);

  const handleSuggestRemedies = () => {
    navigation.navigate('SuggestRemedies', {
      userId: userData?._id || userId,
      orderId: orderId,
      userName: userData?.name || 'User',
      sessionType: 'chat',
    });
  };

  const copyMessage = (text) => {
     Clipboard.setString(text);
     Alert.alert('Copied', 'Message copied to clipboard');
  };

  const handleMediaPress = (mediaUrl, mediaType) => {
    navigation.navigate('MediaViewer', { mediaUrl, mediaType });
  };

  const groupedData = useMemo(() => {
    const grouped = [];
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const next = messages[i + 1];
      grouped.push(current);
      const currentDate = new Date(current.timestamp).toDateString();
      const nextDate = next ? new Date(next.timestamp).toDateString() : null;
      if (currentDate !== nextDate) {
        grouped.push({ _id: `date-${currentDate}-${i}`, type: 'date-separator', date: currentDate });
      }
    }
    return grouped;
  }, [messages]);

  const renderItem = ({ item }) => {
    if (item.type === 'date-separator') {
      const date = new Date(item.date);
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const displayDate = item.date === today ? 'Today' : item.date === yesterday ? 'Yesterday' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      return <View style={styles.dateSeparator}><View style={styles.datePill}><Text style={styles.dateSeparatorText}>{displayDate}</Text></View></View>;
    }

    const time = new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    return (
      <TouchableOpacity activeOpacity={0.8} onLongPress={() => item.text ? Alert.alert('Options', item.text, [{ text: 'Copy', onPress: () => copyMessage(item.text) }, { text: 'Cancel' }]) : null} style={[styles.messageRow, item.isMe ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.messageBubble, item.isMe ? styles.bubbleRight : styles.bubbleLeft]}>
          {(item.type === 'audio' || item.type === 'voice_note') && item.mediaUrl && (
            <View style={styles.audioWrapper}>
              <AudioMessageBubble url={item.mediaUrl} durationSec={item.fileDuration} isOutgoing={item.isMe} containerStyle={{ backgroundColor: 'transparent' }} waveColor={item.isMe ? COLORS.PRIMARY : COLORS.SECONDARY} playIconColor={item.isMe ? COLORS.PRIMARY : COLORS.SECONDARY} />
            </View>
          )}
          {item.type === 'image' && item.mediaUrl && <TouchableOpacity onPress={() => handleMediaPress(item.mediaUrl, 'image')} style={styles.imageContainer}><Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} /></TouchableOpacity>}
          {item.type === 'video' && item.mediaUrl && <TouchableOpacity onPress={() => handleMediaPress(item.mediaUrl, 'video')} style={styles.videoContainer}><Image source={{ uri: item.thumbnailUrl || item.mediaUrl }} style={styles.videoThumbnail} /><View style={styles.videoPlayOverlay}><View style={styles.playCircle}><Ionicons name="play" size={24} color="#FFF" /></View></View></TouchableOpacity>}
          {item.type === 'kundli_details' && item.kundliDetails && (
            <View style={styles.kundliCard}>
              <Text style={styles.kundliTitle}>📜 User Kundli</Text>
              <Text style={styles.kundliText}>{item.kundliDetails.name}, {item.kundliDetails.gender}</Text>
              <Text style={styles.kundliText}>{item.kundliDetails.dob} at {item.kundliDetails.birthTime}</Text>
              <Text style={styles.kundliText}>{item.kundliDetails.birthPlace}</Text>
            </View>
          )}
          {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}
          <View style={styles.metaContainer}>
            <Text style={styles.timeText}>{time}</Text>
            {item.isMe && <Ionicons name="checkmark-done" size={14} color={COLORS.SUCCESS} style={{ marginLeft: 4 }} />}
          </View>
          {item.isMe ? <View style={styles.rightTail} /> : <View style={styles.leftTail} />}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <ScreenWrapper backgroundColor="#ffffff" barStyle="dark-content">
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </ScreenWrapper>
    );
  }

  return (
    // ✅ 1. Wrap with KeyboardProvider (best at root, but fine here)
    <KeyboardProvider statusBarTranslucent> 
      <ScreenWrapper backgroundColor="#ffffff" barStyle="dark-content">
        {/* 2. HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: userData?.profilePicture || 'https://via.placeholder.com/40' }} style={styles.avatar} />
              {isActive && <View style={styles.onlineDot} />}
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>{userData?.name || 'User'}</Text>
              <Text style={styles.headerSubtitle}>{!isActive ? (sessionStatus === 'waiting' ? 'Waiting...' : 'Ended') : 'Online'}</Text>
            </View>
          </View> 

          <View style={styles.headerActions}>
            {isActive && (
              <>
                <View style={[styles.timerPill, secondsLeft < 60 && styles.timerPillWarning]}>
                  <Ionicons name="time-outline" size={14} color={secondsLeft < 60 ? COLORS.DANGER : COLORS.ACCENT} style={{ marginRight: 4 }} />
                  <Text style={[styles.timerTxt, secondsLeft < 60 && styles.timerTxtWarning]}>{formatTime(secondsLeft)}</Text>
                </View>
                <TouchableOpacity style={styles.suggestBtn} onPress={handleSuggestRemedies}>
                  <Ionicons name="bulb" size={16} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.endBtn} onPress={endChat}>
                  <Text style={styles.endBtnText}>End</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.menuBtn} onPress={handleOptionsPress}>
                <Ionicons name="ellipsis-vertical" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. KUNDLI HEADER */}
        {userData?.kundli && (
          <View>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setShowKundli(!showKundli)} style={styles.kundliHeader}>
              <View style={styles.kundliHeaderLeft}>
                <Ionicons name="document-text" size={20} color={COLORS.PRIMARY} />
                <Text style={styles.kundliHeaderText}>User Kundli Details</Text>
              </View>
              <Ionicons name={showKundli ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.PRIMARY} />
            </TouchableOpacity>
            {showKundli && (
              <View style={styles.kundliInfoCard}>
                {userData.kundli.name && <View style={styles.kundliInfoRow}><Ionicons name="person" size={18} color={COLORS.PRIMARY}/><Text style={styles.kundliInfoLabel}>Name:</Text><Text style={styles.kundliInfoValue}>{userData.kundli.name}</Text></View>}
                {userData.kundli.gender && <View style={styles.kundliInfoRow}><Ionicons name={userData.kundli.gender === 'Male' ? 'male' : 'female'} size={18} color={COLORS.PRIMARY}/><Text style={styles.kundliInfoLabel}>Gender:</Text><Text style={styles.kundliInfoValue}>{userData.kundli.gender}</Text></View>}
                {userData.kundli.dateOfBirth && <View style={styles.kundliInfoRow}><Ionicons name="calendar" size={18} color={COLORS.PRIMARY}/><Text style={styles.kundliInfoLabel}>Date of Birth:</Text><Text style={styles.kundliInfoValue}>{new Date(userData.kundli.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text></View>}
                {userData.kundli.timeOfBirth && <View style={styles.kundliInfoRow}><Ionicons name="time" size={18} color={COLORS.PRIMARY}/><Text style={styles.kundliInfoLabel}>Time of Birth:</Text><Text style={styles.kundliInfoValue}>{userData.kundli.timeOfBirth}</Text></View>}
                {userData.kundli.placeOfBirth && <View style={styles.kundliInfoRow}><Ionicons name="location" size={18} color={COLORS.PRIMARY}/><Text style={styles.kundliInfoLabel}>Place of Birth:</Text><Text style={styles.kundliInfoValue}>{userData.kundli.placeOfBirth}</Text></View>}
              </View>
            )}
          </View>
        )}

        {/* 4. CHAT & INPUT AREA */}
        <View style={{ flex: 1 }}>
          <ImageBackground 
              source={require('../../assets/onlyLogoVaidik.png')} 
              style={styles.chatBackground} 
              imageStyle={{ opacity: 0.05, resizeMode: 'center' }} 
              resizeMode="cover"
          >
            {/* ✅ FlatList takes remaining space (flex: 1).
               When keyboard opens, this view shrinks, allowing list to scroll.
            */}
            <FlatList
              ref={flatListRef}
              data={groupedData}
              renderItem={renderItem}
              keyExtractor={(item) => String(item._id)}
              inverted={true}
              onEndReached={loadMoreMessages}
              onEndReachedThreshold={0.3}
              ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color={COLORS.PRIMARY} style={{ marginVertical: 10 }} /> : null}
              // ✅ Padding bottom ensures last message isn't hidden behind input
              contentContainerStyle={[styles.listContent, { paddingBottom: 10 }]} 
              showsVerticalScrollIndicator={false}
            />
          </ImageBackground>

          {/* ✅ KeyboardStickyView sticks to keyboard top. 
             offset accounts for potential bottom tabs/safe area
          */}
          {isActive || sessionStatus === 'waiting' ? (
            <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
              <View style={{backgroundColor: '#fff'}}>
                {sessionStatus === 'waiting' && <Text style={styles.waitingText}>Waiting for user to join...</Text>}
                <View style={[styles.inputContainer, sessionStatus === 'waiting' && { opacity: 0.5 }]}>
                  <TextInput
                    style={styles.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder="Type a message..."
                    placeholderTextColor={COLORS.TEXT_LIGHT}
                    multiline
                    maxLength={1000}
                    editable={isActive}
                  />
                  <TouchableOpacity onPress={sendMessage} disabled={!isActive || !input.trim()} style={[styles.sendButton, (!isActive || !input.trim()) && styles.sendButtonDisabled]}>
                    <Ionicons name="send" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardStickyView>
          ) : (
            <View style={styles.footerBanner}><Text style={{ color: '#fff' }}>Chat ended</Text></View>
          )}
        </View>
      </ScreenWrapper>
    </KeyboardProvider>
  );
};

export default AstroChatRoom;