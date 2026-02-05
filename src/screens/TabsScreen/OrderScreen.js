import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import ScreenWrapper from '../../component/ScreenWrapper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { styles } from '../../style/OrderStyle';
import astrologerOrderService from '../../services/api/astrologer-order.service';

const TABS = ['All', 'Chats', 'Calls', 'Open'];

const AstrologerOrdersScreen = () => {
  const [selectedTab, setSelectedTab] = useState('All');
  const [sessions, setSessions] = useState([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [loading, setLoading] = useState(true);

  const navigation = useNavigation();

  const fetchData = useCallback(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        const [orderRes, sessionRes] = await Promise.all([
          astrologerOrderService.getAstrologerOrders({ page: 1, limit: 50 }),
          astrologerOrderService.getAstrologerSessions({ page: 1, limit: 50 }),
        ]);

        let allSessions = [];

        // ✅ Process Orders (Conversation Threads)
        if (orderRes.success && orderRes.orders?.length > 0) {
          const normalizedOrders = orderRes.orders.map((order) => {
            const sType = (order.serviceType || '').toLowerCase();
            let itemType = 'conversation';
            if (sType.includes('call')) itemType = 'call';
            else if (sType.includes('chat')) itemType = 'chat';

            return {
              id: order.orderId,
              orderId: order.orderId,
              type: itemType,
              status: order.status,
              startedAt: order.createdAt,
              endedAt: order.lastInteractionAt || order.lastSessionEndTime,
              durationSeconds: order.totalUsedDurationSeconds || 0,
              amount: order.totalAmount || 0,
              user: {
                id: order.userId?._id || order.userId,
                name: order.userId?.name || 'User',
                avatar: order.userId?.profileImage || order.userId?.profilePicture,
                phoneNumber: order.userId?.phoneNumber,
              },
              lastPreview: `${order.totalSessions || 0} sessions`, // Safe string
              lastInteractionAt: order.lastInteractionAt || order.createdAt,
              raw: order,
            };
          });
          allSessions.push(...normalizedOrders);
        }

        // ✅ Process Individual Sessions (Chats/Calls)
        if (sessionRes.success && sessionRes.data?.sessions?.length > 0) {
          const sanitizedSessions = sessionRes.data.sessions.map(s => {
              // 🛡️ FIX: Ensure lastPreview is a string, not an object
              let safePreview = '';
              if (typeof s.lastPreview === 'string') {
                  safePreview = s.lastPreview;
              } else if (s.lastPreview && typeof s.lastPreview === 'object') {
                  // If it's a message object, extract content
                  safePreview = s.lastPreview.content || 'Sent a media file';
              } else {
                  safePreview = s.type === 'call' ? 'Call Session' : 'Chat Session';
              }

              return {
                  ...s,
                  lastPreview: safePreview,
                  // Ensure user name is always a string
                  user: {
                      ...s.user,
                      name: typeof s.user?.name === 'string' ? s.user.name : 'User'
                  }
              };
          });
          allSessions.push(...sanitizedSessions);
        }

        // Sort by most recent
        allSessions.sort((a, b) => {
          const t1 = new Date(a.lastInteractionAt || a.startedAt || 0).getTime();
          const t2 = new Date(b.lastInteractionAt || b.startedAt || 0).getTime();
          return t2 - t1;
        });

        // Calculate total earned
        const earned = allSessions.reduce((sum, s) => sum + (s.amount || 0), 0);

        setSessions(allSessions);
        setTotalEarned(earned);

      } catch (error) {
        console.error('❌ [AstroOrders] Fetch data error:', error);
        setSessions([]);
        setTotalEarned(0);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useFocusEffect(fetchData);

  const filteredData = sessions.filter((s) => {
    // Normalize type for filtering
    const isCall = s.type === 'call';
    const isChat = s.type === 'chat' || s.type === 'conversation';

    if (selectedTab === 'All') return true;
    if (selectedTab === 'Chats') return isChat;
    if (selectedTab === 'Calls') return isCall;
    
    if (selectedTab === 'Open') {
      const openStatuses = ['active', 'initiated', 'waiting', 'waitinginqueue'];
      return openStatuses.includes(s.status);
    }
    return true;
  });

  const formatDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString()} • ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '-';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const formatAmount = (value) => {
    if (!value || value === 0) return '₹0';
    return `₹${Number(value).toFixed(0)}`;
  };

  const handleOpenDetail = (item) => {
    if (!item || !item.orderId) {
      Alert.alert(
          "Details Not Found", 
          "We cannot open the history for this session. It might be incomplete."
        );
      return;
    }
    navigation.navigate('AstroHistoryChat', { orderId: item.orderId });
  };

  const renderItem = ({ item }) => {
    const isChat = item.type === 'chat' || item.type === 'conversation';
    const isOpen = ['active', 'initiated', 'waiting', 'waitinginqueue'].includes(item.status || '');
    const hasDetails = !!item.orderId;
    
    // UI Config
    const iconName = isChat ? 'chatbubble' : 'call';
    const iconColor = isChat ? '#2196F3' : '#4CAF50';
    const bgColor = isChat ? '#E3F2FD' : '#E8F5E9';
    const userLetter = (item.user?.name || 'U').charAt(0).toUpperCase();

    return (
      <TouchableOpacity
        style={styles.itemCard}
        activeOpacity={0.8}
        onPress={() => handleOpenDetail(item)}
      >
        <View style={styles.iconWrapper}>
          <View style={styles.userBubble}>
            <Text style={styles.userInitial}>{userLetter}</Text>
          </View>
          <View style={[styles.typeIconContainer, { backgroundColor: bgColor }]}>
            <Ionicons name={iconName} size={14} color={iconColor} />
          </View>
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.user?.name || 'User'}
            </Text>
            <Text style={styles.itemDate} numberOfLines={1}>
              {formatDateTime(item.lastInteractionAt || item.endedAt || item.startedAt)}
            </Text>
          </View>

          <Text style={styles.itemMeta} numberOfLines={1}>
            {/* 🛡️ RENDER SAFE STRING PREVIEW */}
            {item.lastPreview || (isChat ? 'Consultation thread' : 'Call Session')}
          </Text>

          <Text style={styles.itemSubMeta} numberOfLines={1}>
            {item.type === 'conversation' 
              ? `${item.raw?.totalSessions || 0} sessions • Total: ${formatAmount(item.amount)}`
              : `Duration: ${formatDuration(item.durationSeconds)} • Earned: ${formatAmount(item.amount)}`
            }
          </Text>
        </View>

        <View style={styles.itemRight}>
          <View style={[styles.statusBadge, isOpen ? styles.badgeActive : styles.badgeCompleted]}>
            <Text style={[styles.statusText, isOpen ? styles.textActive : styles.textCompleted]}>
              {isOpen ? 'Open' : 'Completed'}
            </Text>
          </View>
          {hasDetails ? (
            <Text style={styles.viewText}>View</Text>
          ) : (
             <Text style={styles.noDetailsText}>No Rec</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const tabCounts = {
    All: sessions.length,
    Chats: sessions.filter(s => s.type === 'chat' || s.type === 'conversation').length,
    Calls: sessions.filter(s => s.type === 'call').length,
    Open: sessions.filter(s => ['active', 'initiated', 'waiting', 'waitinginqueue'].includes(s.status || '')).length,
  };

  return (
    <ScreenWrapper backgroundColor="#ffffff" barStyle="dark-content">
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>My Sessions ({sessions.length})</Text>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, selectedTab === tab && styles.tabBtnActive]}
              onPress={() => setSelectedTab(tab)}
            >
              <Text style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}>
                {tab} {tab !== 'All' && `(${tabCounts[tab]})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#5A2CCF" />
          <Text style={styles.loadingText}>Loading sessions...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={filteredData.length === 0 ? [styles.listContent, styles.center] : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="hourglass-outline" size={64} color="#CCC" />
              <Text style={styles.emptyText}>No {selectedTab.toLowerCase()} sessions found</Text>
              <Text style={styles.emptySubtext}>Check other tabs for sessions</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenWrapper>
  );
};

export default AstrologerOrdersScreen;