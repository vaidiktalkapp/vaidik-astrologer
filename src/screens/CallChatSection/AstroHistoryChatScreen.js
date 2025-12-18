// src/screens/chat/AstroHistoryChatScreen.js

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Clipboard,
  Image,
  ImageBackground,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import ChatService from '../../services/api/chat/ChatService';
import orderService from '../../services/api/orderService';
import { useAuth } from '../../contexts/AuthContext';
import AudioMessageBubble from '../../component/chat/AudioMessageBubble';

const { width } = Dimensions.get('window');

const COLORS = {
  PRIMARY: '#372643',          // Deep purple/plum
  SECONDARY: '#4A3456',        // Lighter purple
  ACCENT: '#FFC107',           // Yellow
  BG: '#F0F4F8',              // Light background
  BG_CHAT: '#E8EFF5',         // Chat background
  BUBBLE_ASTRO: '#E0D4F0',    // Light purple for astrologer
  BUBBLE_USER: '#FFFFFF',      // White for user
  TEXT_DARK: '#1F2937',
  TEXT_LIGHT: '#6B7280',
  BORDER: '#D1D5DB',
  SUCCESS: '#10B981',
  DANGER: '#FF453A',
  WARNING: '#F59E0B',
};

const AstroHistoryChatScreen = ({ route }) => {
  const navigation = useNavigation();
  const { astrologer } = useAuth();
  const astrologerId = astrologer?._id || astrologer?.id;
  const { orderId } = route.params;

  const [messages, setMessages] = useState([]);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [chatPartner, setChatPartner] = useState(null);
  const [privacySettings, setPrivacySettings] = useState(null);

  const flatListRef = useRef(null);

  // Load chat history and check privacy
  const loadHistory = useCallback(async () => {
    if (!orderId) {
      Alert.alert('Error', 'Invalid Order ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [chatRes, orderRes] = await Promise.all([
        ChatService.getConversationHistory(orderId),
        orderService.getOrderDetails(orderId, astrologerId),
      ]);

      let msgs = [];
      let meta = {};

      // Parse response
      if (Array.isArray(chatRes)) msgs = chatRes;
      else if (chatRes?.data?.messages) {
        msgs = chatRes.data.messages;
        meta = chatRes.data.meta || {};
      } else if (chatRes?.messages) {
        msgs = chatRes.messages;
        meta = chatRes.meta || {};
      } else if (chatRes?.data && Array.isArray(chatRes.data)) {
        msgs = chatRes.data;
      }

      const privacy = meta?.user?.privacy || {};
      const userMeta = meta?.user || {};

      // ✅ Check privacy: if true, block access
      if (privacy?.restrictions?.astrologerChatAccessAfterEnd === true) {
        console.log('🚫 Access blocked by user privacy settings');
        setAccessBlocked(true);
        setPrivacySettings(privacy);
        setLoading(false);
        return;
      }

      // Format messages with media support
      const formattedMessages = msgs.map((msg) => {
        const senderIdRaw = msg.senderId;
        const senderId = senderIdRaw?._id || senderIdRaw;
        const type = msg.type || 'text';
        const mediaUrl = msg.fileUrl || msg.mediaUrl || msg.url || null;
        const isTextLike = type === 'text' || type === 'kundli_details';

        return {
          id: msg._id || msg.messageId,
          text: isTextLike ? msg.content : '',
          user: {
            id: senderId,
            name: msg.senderModel === 'User' ? 'User' : 'Astrologer',
          },
          timestamp: msg.sentAt || msg.createdAt,
          type,
          isStarred: msg.isStarred || false,
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

      formattedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      setMessages(formattedMessages);
      setUserData(userMeta);
      setPrivacySettings(privacy);

      if (orderRes.data) {
        setChatPartner(orderRes.data.userId);
      }

      console.log('✅ Loaded', formattedMessages.length, 'messages');
    } catch (error) {
      console.error('❌ Load error:', error);
      Alert.alert('Error', 'Failed to load chat history');
    } finally {
      setLoading(false);
    }
  }, [orderId, astrologerId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const copyMessage = (text) => {
    Clipboard.setString(text);
    Alert.alert('Copied', 'Message copied to clipboard');
  };

  const handleMediaPress = (mediaUrl, mediaType) => {
    navigation.navigate('MediaViewer', { mediaUrl, mediaType });
  };

  const handleSuggestRemedies = () => {
    const targetUser = userData || chatPartner;
    if (!targetUser) {
      Alert.alert('Error', 'User details not found');
      return;
    }
    navigation.navigate('SuggestRemedies', {
      userId: targetUser._id || targetUser.id,
      orderId: orderId,
      userName: targetUser.name || 'User',
      sessionType: 'chat',
    });
  };

  const handleViewSuggestions = () => {
    const targetUser = userData || chatPartner;
    navigation.navigate('AstrologerSuggestedRemedies', {
      orderId: orderId,
      userName: targetUser?.name || 'User',
    });
  };

  const formatDuration = (sec = 0) => {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const groupMessages = (msgs) => {
    const grouped = [];
    let lastDate = null;
    msgs.forEach((msg) => {
      const date = new Date(msg.timestamp).toDateString();
      if (date !== lastDate) {
        grouped.push({ type: 'date', date, id: `date-${date}` });
        lastDate = date;
      }
      grouped.push(msg);
    });
    return grouped;
  };

  const renderDateSeparator = (date) => (
    <View style={styles.dateSeparator}>
      <View style={styles.datePill}>
        <Text style={styles.dateText}>{date}</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }) => {
    if (item.type === 'date') {
      const dateObj = new Date(item.date);
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      let label =
        item.date === today
          ? 'Today'
          : item.date === yesterday
          ? 'Yesterday'
          : dateObj.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
      return renderDateSeparator(label);
    }

    const isMe = item.senderModel === 'Astrologer';
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
        style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}
      >
        <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
          {item.isStarred && (
            <View style={styles.starIcon}>
              <Ionicons name="star" size={12} color={COLORS.ACCENT} />
            </View>
          )}

          {/* Audio/Voice Note - with wrapper for visibility */}
          {showAudio && (
            <View style={styles.audioWrapper}>
              <AudioMessageBubble
                url={item.mediaUrl}
                durationSec={item.fileDuration}
                isUser={!isMe}
                containerStyle={{
                  backgroundColor: 'transparent',
                }}
                waveColor={isMe ? COLORS.PRIMARY : COLORS.SECONDARY}
                playIconColor={isMe ? COLORS.PRIMARY : COLORS.SECONDARY}
              />
            </View>
          )}

          {/* Image */}
          {showImage && (
            <TouchableOpacity
              onPress={() => handleMediaPress(item.mediaUrl, 'image')}
              style={styles.imageContainer}
            >
              <Image source={{ uri: item.mediaUrl }} style={styles.mediaImg} />
            </TouchableOpacity>
          )}

          {/* Video */}
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

          {/* Kundli Details */}
          {item.type === 'kundli_details' && item.kundliDetails && (
            <View style={styles.kundliCard}>
              <Text style={styles.kundliTitle}>📜 Kundli Details</Text>
              <Text style={styles.kundliText}>{item.kundliDetails.name}</Text>
              <Text style={styles.kundliText}>{item.kundliDetails.dob}</Text>
            </View>
          )}

          {/* Text Message */}
          {item.text ? <Text style={styles.msgText}>{item.text}</Text> : null}

          {/* Timestamp & Status */}
          <View style={styles.metaContainer}>
            <Text style={styles.timeText}>{time}</Text>
            {isMe && (
              <Ionicons
                name="checkmark-done"
                size={14}
                color={COLORS.SUCCESS}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>

          {/* Bubble Tails */}
          {isMe ? <View style={styles.rightTail} /> : <View style={styles.leftTail} />}
        </View>
      </TouchableOpacity>
    );
  };

  // Loading State
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Loading chat history...</Text>
      </SafeAreaView>
    );
  }

  // Access Blocked by Privacy
  if (accessBlocked) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.blockedContainer}>
          <View style={styles.blockedIconContainer}>
            <Ionicons name="lock-closed" size={60} color={COLORS.DANGER} />
          </View>
          <Text style={styles.blockedTitle}>Access Restricted</Text>
          <Text style={styles.blockedText}>
            The user has restricted access to this chat history.
          </Text>
          <Text style={styles.blockedSubtext}>
            This is a privacy setting enabled by the user.
          </Text>
          <TouchableOpacity style={styles.goBackBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.goBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.avatarContainer}>
            <Image
              source={{
                uri:
                  userData?.profileImage ||
                  userData?.profilePicture ||
                  'https://via.placeholder.com/40',
              }}
              style={styles.headerAvatar}
            />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {userData?.name || 'User'}
            </Text>
            <Text style={styles.headerSubtitle}>Chat History</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleViewSuggestions}>
            <Ionicons name="time-outline" size={20} color={COLORS.PRIMARY} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.remedyBtn} onPress={handleSuggestRemedies}>
            <Ionicons name="medical" size={16} color="#FFF" />
            <Text style={styles.remedyBtnText}>Suggest</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat Area */}
      <ImageBackground
        source={require('../../assets/onlyLogoVaidik.png')}
        style={styles.chatBackground}
        imageStyle={{ opacity: 0.05, resizeMode: 'center' }}
        resizeMode="cover"
      >
        <FlatList
          ref={flatListRef}
          data={groupMessages(messages)}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.flatListContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color={COLORS.TEXT_LIGHT} />
              <Text style={styles.emptyText}>No messages found</Text>
            </View>
          }
        />
      </ImageBackground>

      {/* Footer Info */}
      <View style={styles.footer}>
        <Ionicons name="lock-closed" size={14} color={COLORS.TEXT_LIGHT} />
        <Text style={styles.footerText}>
          {privacySettings?.restrictions?.astrologerChatAccessAfterEnd === false
            ? 'User allowed access to chat history'
            : 'Chat history viewer'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BG,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.TEXT_LIGHT,
    fontWeight: '500',
  },

  // Access Blocked Screen
  blockedContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  blockedIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  blockedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.TEXT_DARK,
    marginBottom: 12,
  },
  blockedText: {
    fontSize: 16,
    color: COLORS.TEXT_DARK,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  blockedSubtext: {
    fontSize: 14,
    color: COLORS.TEXT_LIGHT,
    textAlign: 'center',
    marginBottom: 32,
  },
  goBackBtn: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
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
  goBackBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
    backgroundColor: '#FFF',
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  remedyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.WARNING,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 5,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.WARNING,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  remedyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },

  // Chat Area
  chatBackground: {
    flex: 1,
    backgroundColor: COLORS.BG_CHAT,
  },
  flatListContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    paddingBottom: 40,
  },

  // Date Separator
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  datePill: {
    backgroundColor: 'rgba(55, 38, 67, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(55, 38, 67, 0.2)',
  },
  dateText: {
    fontSize: 11,
    color: COLORS.PRIMARY,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Messages
  msgRow: {
    marginVertical: 3,
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  msgRowLeft: {
    justifyContent: 'flex-start',
  },
  msgRowRight: {
    justifyContent: 'flex-end',
  },

  bubble: {
    maxWidth: width * 0.75,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    position: 'relative',
    minWidth: 80,
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
  bubbleLeft: {
    backgroundColor: COLORS.BUBBLE_USER,
    borderTopLeftRadius: 4,
    marginLeft: 4,
  },
  bubbleRight: {
    backgroundColor: COLORS.BUBBLE_ASTRO,
    borderTopRightRadius: 4,
    marginRight: 4,
  },

  // Audio Wrapper for better visibility
  audioWrapper: {
    marginBottom: 6,
    paddingVertical: 4,
  },

  msgText: {
    fontSize: 15,
    color: COLORS.TEXT_DARK,
    lineHeight: 22,
  },

  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    color: COLORS.TEXT_LIGHT,
    fontWeight: '500',
  },

  // Star Badge
  starIcon: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 2,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
  },

  // Media
  imageContainer: {
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  mediaImg: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },

  videoContainer: {
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  videoThumbnail: {
    width: 220,
    height: 220,
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
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
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

  // Kundli Card
  kundliCard: {
    backgroundColor: 'rgba(55, 38, 67, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(55, 38, 67, 0.2)',
  },
  kundliTitle: {
    color: COLORS.PRIMARY,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
  kundliText: {
    color: COLORS.TEXT_DARK,
    fontSize: 13,
    lineHeight: 20,
  },

  // Tails
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

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.TEXT_LIGHT,
    fontWeight: '500',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    color: COLORS.TEXT_LIGHT,
    fontWeight: '500',
  },
});

export default AstroHistoryChatScreen;
