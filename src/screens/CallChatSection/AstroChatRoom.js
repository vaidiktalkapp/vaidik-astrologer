// src/screens/chat/AstroChatRoom.js

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  Dimensions,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../../contexts/AuthContext';
import AstrologerChatSocket from '../../services/socket/AstrologerChatSocket';
import ChatService from '../../services/api/chat/ChatService';
import AudioMessageBubble from '../../component/chat/AudioMessageBubble';

const { width } = Dimensions.get('window');

const COLORS = {
  PRIMARY: '#372643',
  SECONDARY: '#4A3456',
  ACCENT: '#FFC107',
  BG: '#F0F4F8',
  BG_CHAT: '#E8EFF5',
  BUBBLE_ASTRO: '#E0D4F0',
  BUBBLE_USER: '#FFFFFF',
  TEXT_DARK: '#1F2937',
  TEXT_LIGHT: '#6B7280',
  BORDER: '#D1D5DB',
  SUCCESS: '#10B981',
  DANGER: '#FF453A',
  WARNING: '#F59E0B',
};

const AstroChatRoom = ({ route, navigation }) => {
  const {
    state: { astrologer },
  } = useAuth();
  const astrologerId = astrologer?._id || astrologer?.id;

  const { sessionId, orderId, userId } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sessionStatus, setSessionStatus] = useState('waiting');
  const [userData, setUserData] = useState(null);
  const [showKundli, setShowKundli] = useState(true);

  const flatListRef = useRef(null);

  const formatTime = (seconds) => {
    if (seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDuration = (sec = 0) => {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // ===== 1. LOAD DATA =====
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);

      console.log('📥 Loading conversation history for orderId:', orderId);
      const res = await ChatService.getConversationHistory(orderId);

      let msgs = [];
      let meta = {};

      if (Array.isArray(res)) msgs = res;
      else if (res?.data?.messages) {
        msgs = res.data.messages;
        meta = res.data.meta || {};
      } else if (res?.messages) {
        msgs = res.messages;
        meta = res.meta || {};
      } else if (res?.data && Array.isArray(res.data)) {
        msgs = res.data;
      }

      const userMeta = meta?.user || {};
      
      console.log('👤 =================================');
      console.log('👤 FULL USER DATA RECEIVED:');
      console.log('👤 =================================');
      console.log(JSON.stringify(userMeta, null, 2));
      console.log('👤 =================================');
      console.log('👤 Kundli Data:', JSON.stringify(userMeta.kundli, null, 2));
      console.log('👤 =================================');

      if (userMeta) {
        setUserData({
          _id: userMeta._id,
          name: userMeta.name || 'User',
          profilePicture: userMeta.profilePicture || userMeta.profileImage,
          kundli: userMeta.kundli || {
            name: userMeta.name,
            gender: userMeta.gender,
            dateOfBirth: userMeta.dateOfBirth,
            timeOfBirth: userMeta.timeOfBirth,
            placeOfBirth: userMeta.placeOfBirth,
          },
          privacy: userMeta.privacy || {},
        });
        console.log('✅ User data loaded:', userMeta.name);
      }

      const formatted = msgs.map((msg) => {
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
      });

      console.log('✅ Loaded', formatted.length, 'messages');
      setMessages(formatted);
    } catch (e) {
      console.error('❌ Error loading messages', e);
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  // ===== 2. SOCKET SETUP =====
  useEffect(() => {
    let mounted = true;

    const initSocket = async () => {
      console.log('🔌 Astrologer Joining Session:', sessionId);

      AstrologerChatSocket.emit('join_session', {
        sessionId,
        userId: astrologerId,
        role: 'astrologer',
      });

      AstrologerChatSocket.emit('sync_timer', { sessionId });

      AstrologerChatSocket.on('chat_message', (msg) => {
        if (msg.sessionId !== sessionId) return;
        console.log('💬 New message received');

        setMessages((prev) => {
          if (prev.some((m) => m._id === msg.messageId)) return prev;

          if (msg.senderModel === 'Astrologer') {
            const idx = prev.findIndex(
              (m) => m.isMe && m._id.startsWith('temp-') && m.text === msg.content
            );
            if (idx > -1) {
              const newArr = [...prev];
              newArr[idx] = {
                ...newArr[idx],
                _id: msg.messageId,
                timestamp: msg.sentAt,
              };
              return newArr;
            }
          }

          const type = msg.type || 'text';
          const mediaUrl = msg.fileUrl || msg.mediaUrl || msg.url || null;
          const isTextLike = type === 'text' || type === 'kundli_details';

          return [
            {
              _id: msg.messageId,
              text: isTextLike ? msg.content : '',
              isMe: msg.senderModel === 'Astrologer',
              timestamp: msg.sentAt,
              type,
              mediaUrl,
              thumbnailUrl: msg.thumbnailUrl || null,
              mimeType: msg.mimeType || null,
              fileDuration: msg.fileDuration || null,
              fileName: msg.fileName || null,
              fileSize: msg.fileSize || null,
              kundliDetails: msg.kundliDetails,
              senderModel: msg.senderModel,
            },
            ...prev,
          ];
        });
      });

      AstrologerChatSocket.on('timer_start', (data) => {
        console.log('🎬 timer_start event received:', data);
        if (data.sessionId === sessionId) {
          console.log('✅ Chat Active - User Joined!');
          setIsActive(true);
          setSessionStatus('active');
          setSecondsLeft(data.maxDurationSeconds);
        }
      });

      AstrologerChatSocket.on('timer_tick', (data) => {
        console.log('⏱️ timer_tick received:', data);

        if (data.remainingSeconds !== undefined) {
          setSecondsLeft(data.remainingSeconds);

          setIsActive((currentIsActive) => {
            if (!currentIsActive && data.remainingSeconds > 0) {
              console.log('✅ Auto-activating from timer_tick');
              setSessionStatus('active');
              return true;
            }
            return currentIsActive;
          });
        }
      });

      const handleEnd = () => {
        console.log('🛑 Session Ended');
        setIsActive(false);
        setSessionStatus('ended');
        Alert.alert('Ended', 'Session has ended.');
      };

      AstrologerChatSocket.on('timer_ended', handleEnd);
      AstrologerChatSocket.on('chat_ended', handleEnd);
    };

    initSocket();
    loadInitialData();

    return () => {
      mounted = false;
      console.log('🔌 Cleaning up socket listeners');
      AstrologerChatSocket.off('chat_message');
      AstrologerChatSocket.off('timer_start');
      AstrologerChatSocket.off('timer_tick');
      AstrologerChatSocket.off('chat_ended');
      AstrologerChatSocket.off('timer_ended');
    };
  }, [sessionId, astrologerId, loadInitialData]);

  // ===== 3. SEND MESSAGE =====
  const sendMessage = () => {
    if (!input.trim()) return;

    const content = input.trim();
    setInput('');

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      {
        _id: tempId,
        text: content,
        isMe: true,
        timestamp: new Date().toISOString(),
        type: 'text',
      },
      ...prev,
    ]);

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

  const endChat = () => {
    Alert.alert('End Session', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: () => {
          AstrologerChatSocket.emit('end_chat', {
            sessionId,
            userId: astrologerId,
            reason: 'astrologer_ended',
          });
          navigation.goBack();
        },
      },
    ]);
  };

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

  const groupMessagesByDate = (msgs) => {
    const grouped = [];
    let currentDate = null;

    const sortedMsgs = [...msgs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    sortedMsgs.forEach((message) => {
      const messageDate = new Date(message.timestamp).toDateString();
      if (messageDate !== currentDate) {
        grouped.push({
          _id: `date-${messageDate}`,
          type: 'date-separator',
          date: messageDate,
        });
        currentDate = messageDate;
      }
      grouped.push(message);
    });

    return grouped.reverse();
  };

  // ===== RENDER =====
  const renderItem = ({ item }) => {
    if (item.type === 'date-separator') {
      const date = new Date(item.date);
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const displayDate =
        item.date === today
          ? 'Today'
          : item.date === yesterday
          ? 'Yesterday'
          : date.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

      return (
        <View style={styles.dateSeparator}>
          <View style={styles.datePill}>
            <Text style={styles.dateSeparatorText}>{displayDate}</Text>
          </View>
        </View>
      );
    }

    const time = new Date(item.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const showImage = item.type === 'image' && item.mediaUrl;
    const showVideo = item.type === 'video' && item.mediaUrl;
    const showAudio = (item.type === 'audio' || item.type === 'voice_note') && item.mediaUrl;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onLongPress={() =>
          item.text
            ? Alert.alert('Options', item.text, [
                { text: 'Copy', onPress: () => copyMessage(item.text) },
                { text: 'Cancel' },
              ])
            : null
        }
        style={[styles.messageRow, item.isMe ? styles.rowRight : styles.rowLeft]}
      >
        <View style={[styles.messageBubble, item.isMe ? styles.bubbleRight : styles.bubbleLeft]}>
          {showAudio && (
            <View style={styles.audioWrapper}>
              <AudioMessageBubble
                url={item.mediaUrl}
                durationSec={item.fileDuration}
                isUser={!item.isMe}
                containerStyle={{ backgroundColor: 'transparent' }}
                waveColor={item.isMe ? COLORS.PRIMARY : COLORS.SECONDARY}
                playIconColor={item.isMe ? COLORS.PRIMARY : COLORS.SECONDARY}
              />
            </View>
          )}

          {showImage && (
            <TouchableOpacity
              onPress={() => handleMediaPress(item.mediaUrl, 'image')}
              style={styles.imageContainer}
            >
              <Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} />
            </TouchableOpacity>
          )}

          {showVideo && (
            <TouchableOpacity
              onPress={() => handleMediaPress(item.mediaUrl, 'video')}
              style={styles.videoContainer}
            >
              <Image
                source={{ uri: item.thumbnailUrl || item.mediaUrl }}
                style={styles.videoThumbnail}
              />

              <View style={styles.videoPlayOverlay}>
                <View style={styles.playCircle}>
                  <Ionicons name="play" size={24} color="#FFF" />
                </View>
              </View>

              {item.fileDuration ? (
                <View style={styles.videoDurationBadge}>
                  <Text style={styles.videoDurationText}>
                    {formatDuration(item.fileDuration)}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}

          {item.type === 'kundli_details' && item.kundliDetails && (
            <View style={styles.kundliCard}>
              <Text style={styles.kundliTitle}>📜 User Kundli</Text>
              <Text style={styles.kundliText}>
                {item.kundliDetails.name}, {item.kundliDetails.gender}
              </Text>
              <Text style={styles.kundliText}>
                {item.kundliDetails.dob} at {item.kundliDetails.birthTime}
              </Text>
              <Text style={styles.kundliText}>{item.kundliDetails.birthPlace}</Text>
            </View>
          )}

          {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}

          <View style={styles.metaContainer}>
            <Text style={styles.timeText}>{time}</Text>
            {item.isMe && (
              <Ionicons
                name="checkmark-done"
                size={14}
                color={COLORS.SUCCESS}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>

          {item.isMe ? <View style={styles.rightTail} /> : <View style={styles.leftTail} />}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ✅ Wrap entire content in KeyboardAvoidingView */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>

            <View style={styles.avatarContainer}>
              <Image
                source={{
                  uri: userData?.profilePicture || 'https://via.placeholder.com/40',
                }}
                style={styles.avatar}
              />
              {isActive && <View style={styles.onlineDot} />}
            </View>

            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {userData?.name || 'User'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {isActive ? 'Active now' : sessionStatus === 'waiting' ? 'Waiting...' : 'Ended'}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>
                {isActive
                  ? formatTime(secondsLeft)
                  : sessionStatus === 'waiting'
                  ? 'WAITING'
                  : 'ENDED'}
              </Text>
            </View>

            <TouchableOpacity style={styles.suggestBtn} onPress={handleSuggestRemedies}>
              <Ionicons name="bulb" size={16} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.endBtn} onPress={endChat}>
              <Text style={styles.endBtnText}>End</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Kundli Card */}
        {userData?.kundli && (
          <View>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setShowKundli(!showKundli)}
              style={styles.kundliHeader}
            >
              <View style={styles.kundliHeaderLeft}>
                <Ionicons name="document-text" size={20} color={COLORS.PRIMARY} />
                <Text style={styles.kundliHeaderText}>User Kundli Details</Text>
              </View>
              <Ionicons
                name={showKundli ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={COLORS.PRIMARY}
              />
            </TouchableOpacity>

            {showKundli && (
              <View style={styles.kundliInfoCard}>
                {userData.kundli.name && (
                  <View style={styles.kundliInfoRow}>
                    <Ionicons name="person" size={18} color={COLORS.PRIMARY} />
                    <Text style={styles.kundliInfoLabel}>Name:</Text>
                    <Text style={styles.kundliInfoValue}>{userData.kundli.name}</Text>
                  </View>
                )}

                {userData.kundli.gender && (
                  <View style={styles.kundliInfoRow}>
                    <Ionicons
                      name={userData.kundli.gender === 'Male' ? 'male' : 'female'}
                      size={18}
                      color={COLORS.PRIMARY}
                    />
                    <Text style={styles.kundliInfoLabel}>Gender:</Text>
                    <Text style={styles.kundliInfoValue}>{userData.kundli.gender}</Text>
                  </View>
                )}

                {userData.kundli.dateOfBirth && (
                  <View style={styles.kundliInfoRow}>
                    <Ionicons name="calendar" size={18} color={COLORS.PRIMARY} />
                    <Text style={styles.kundliInfoLabel}>Date of Birth:</Text>
                    <Text style={styles.kundliInfoValue}>
                      {new Date(userData.kundli.dateOfBirth).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                )}

                {userData.kundli.timeOfBirth && (
                  <View style={styles.kundliInfoRow}>
                    <Ionicons name="time" size={18} color={COLORS.PRIMARY} />
                    <Text style={styles.kundliInfoLabel}>Birth Time:</Text>
                    <Text style={styles.kundliInfoValue}>{userData.kundli.timeOfBirth}</Text>
                  </View>
                )}

                {userData.kundli.placeOfBirth && (
                  <View style={styles.kundliInfoRow}>
                    <Ionicons name="location" size={18} color={COLORS.PRIMARY} />
                    <Text style={styles.kundliInfoLabel}>Birth Place:</Text>
                    <Text style={styles.kundliInfoValue}>{userData.kundli.placeOfBirth}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Chat Area */}
        <ImageBackground
          source={require('../../assets/onlyLogoVaidik.png')}
          style={styles.chatBackground}
          imageStyle={{ opacity: 0.05, resizeMode: 'center' }}
          resizeMode="cover"
        >
          <FlatList
            ref={flatListRef}
            data={groupMessagesByDate(messages)}
            renderItem={renderItem}
            keyExtractor={(item) => item._id}
            inverted
            contentContainerStyle={styles.listContent}
          />
        </ImageBackground>

        {/* Input Area */}
        {isActive || sessionStatus === 'waiting' ? (
          <View>
            {sessionStatus === 'waiting' && (
              <Text style={styles.waitingText}>Waiting for user to join...</Text>
            )}
            <View style={[styles.inputContainer, sessionStatus === 'waiting' && { opacity: 0.5 }]}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Type your message..."
                placeholderTextColor={COLORS.TEXT_LIGHT}
                multiline
                maxLength={1000}
                editable={isActive}
              />
              <TouchableOpacity
                onPress={sendMessage}
                disabled={!isActive || !input.trim()}
                style={[styles.sendButton, (!isActive || !input.trim()) && styles.sendButtonDisabled]}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.footerBanner}>
            <Text style={{ color: '#fff' }}>Chat ended</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.TEXT_LIGHT,
    fontWeight: '500',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: COLORS.PRIMARY,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.SUCCESS,
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontWeight: 'bold', fontSize: 16, color: '#FFF' },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerContainer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  timerText: { color: COLORS.ACCENT, fontWeight: 'bold', fontSize: 14 },
  suggestBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.WARNING,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endBtn: {
    backgroundColor: COLORS.DANGER,
    padding: 6,
    borderRadius: 6,
  },
  endBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  kundliHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  kundliHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kundliHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.PRIMARY,
  },
  kundliInfoCard: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  kundliInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  kundliInfoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.TEXT_LIGHT,
    width: 100,
  },
  kundliInfoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_DARK,
  },

  chatBackground: { flex: 1, backgroundColor: COLORS.BG_CHAT },
  listContent: { paddingHorizontal: 10, paddingVertical: 20 },

  dateSeparator: {
    alignItems: 'center',
    marginVertical: 12,
  },
  datePill: {
    backgroundColor: 'rgba(55, 38, 67, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(55, 38, 67, 0.2)',
  },
  dateSeparatorText: {
    fontSize: 11,
    color: COLORS.PRIMARY,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  messageRow: { marginVertical: 4, flexDirection: 'row', width: '100%' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 8,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  bubbleRight: { alignSelf: 'flex-end', backgroundColor: COLORS.BUBBLE_ASTRO },
  bubbleLeft: { alignSelf: 'flex-start', backgroundColor: COLORS.BUBBLE_USER },

  audioWrapper: {
    marginBottom: 6,
    paddingVertical: 4,
  },

  messageText: { fontSize: 15, color: COLORS.TEXT_DARK },

  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    color: COLORS.TEXT_LIGHT,
  },

  imageContainer: {
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },

  videoContainer: {
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  videoThumbnail: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(55, 38, 67, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.ACCENT,
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  videoDurationText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },

  kundliCard: {
    alignSelf: 'center',
    width: '100%',
    backgroundColor: 'rgba(55, 38, 67, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.PRIMARY,
  },
  kundliTitle: { fontWeight: 'bold', color: COLORS.PRIMARY, marginBottom: 4 },
  kundliText: { color: COLORS.TEXT_DARK, fontSize: 13 },

  leftTail: {
    position: 'absolute',
    top: 0,
    left: -6,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderTopColor: COLORS.BUBBLE_USER,
    borderLeftWidth: 8,
    borderLeftColor: 'transparent',
  },
  rightTail: {
    position: 'absolute',
    top: 0,
    right: -6,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderTopColor: COLORS.BUBBLE_ASTRO,
    borderRightWidth: 8,
    borderRightColor: 'transparent',
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.BG,
    color: COLORS.TEXT_DARK,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    paddingTop: 10,
    marginRight: 10,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  sendButton: {
    backgroundColor: COLORS.PRIMARY,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.PRIMARY,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.TEXT_LIGHT,
    opacity: 0.5,
  },
  waitingText: {
    textAlign: 'center',
    color: COLORS.TEXT_LIGHT,
    fontSize: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 193, 7, 0.3)',
  },
  footerBanner: { 
    padding: 15, 
    backgroundColor: COLORS.PRIMARY, 
    alignItems: 'center',
  },
});

export default AstroChatRoom;
