// src/services/api/astrologer-order.service.js
import { apiClient } from './axios.instance';

class AstrologerOrderService {
  /**
   * ✅ Get astrologer orders
   */
  async getAstrologerOrders({ page = 1, limit = 20, status, type } = {}) {
    try {
      const params = { page, limit };
      if (status) params.status = status;
      if (type) params.type = type;

      const res = await apiClient.get('/orders/astrologer/my-orders', { params });
      const ok = res.data?.success !== false;
      const data = ok ? res.data.data : { data: [], pagination: { page, limit, total: 0, pages: 0 } };
      
      return {
        success: ok,
        orders: data.orders || [],
        pagination: data.pagination || { page, limit, total: 0, pages: 0 },
      };
    } catch (error) {
      console.error('[AstroOrders] getAstrologerOrders error:', error?.response?.data || error);
      throw error;
    }
  }

  /**
   * ✅ Get astrologer chat sessions
   */
  async getAstrologerChatSessions({ page = 1, limit = 20, status } = {}) {
    try {
      const params = { page, limit };
      if (status) params.status = status;

      const res = await apiClient.get('/chat/astrologer/sessions', { params });
      
      const ok = res.data?.success !== false;
      const payload = res.data?.data || res.data || {};
      const sessions = payload.sessions || payload.data || payload || [];
      const pagination = payload.pagination || { page, limit, total: sessions.length, pages: 1 };

      const mapped = sessions.map((s) => ({
        id: s.sessionId || s.id,
        orderId: s.orderId || null,
        type: 'chat',
        status: s.status,
        startedAt: s.startTime || s.startedAt || null,
        endedAt: s.endTime || s.endedAt || null,
        durationSeconds: s.duration || s.durationSeconds || 0,
        amount: s.totalAmount || s.billingAmount || 0,
        user: {
          id: s.userId?.id || s.userId || null,
          name: s.userName || s.userId?.name || 'User',
          avatar: s.userId?.profileImage || s.userId?.profilePicture || null,
          phoneNumber: s.userId?.phoneNumber || null,
        },
        lastPreview: s.lastMessagePreview || s.lastMessage || (s.lastMessage?.content ?? null),
        lastInteractionAt: s.lastInteractionAt || s.endTime || s.startTime || s.createdAt || null,
        raw: s,
      }));

      return {
        success: ok,
        sessions: mapped,
        pagination,
      };
    } catch (error) {
      console.error('[AstroOrders] getAstrologerChatSessions error:', error?.response?.data || error);
      throw error;
    }
  }

  /**
   * ✅ Combined history for astrologer chats + calls
   */
  async getAstrologerSessions({ page = 1, limit = 20, status } = {}) {
    try {
      const params = { page, limit };
      if (status) params.status = status;

      // ✅ PARALLEL FETCH
      const [chatRes, callRes] = await Promise.all([
        apiClient.get('/chat/astrologer/sessions', { params }),
        apiClient.get('/calls/astrologer/sessions', { params }),
      ]);

      const chatOk = chatRes.data?.success !== false;
      const callOk = callRes.data?.success !== false;

      // ✅ FIX: Robust extraction logic (handles res.data.data.sessions vs res.data.sessions)
      const extractSessions = (response) => {
        if (!response || !response.data) return [];
        const payload = response.data.data || response.data;
        return payload.sessions || payload.data || (Array.isArray(payload) ? payload : []);
      };

      const chatItems = chatOk ? extractSessions(chatRes) : [];
      const callItems = callOk ? extractSessions(callRes) : [];

      console.log(`[AstroOrders] Fetched: ${chatItems.length} chats, ${callItems.length} calls`);

      // Normalize chat sessions
      const chatMapped = chatItems.map((s) => ({
        id: s.sessionId || s._id,
        orderId: s.orderId,
        type: 'chat',
        status: s.status,
        startedAt: s.startTime || s.startedAt,
        endedAt: s.endTime || s.endedAt,
        durationSeconds: s.duration || s.totalDurationSeconds || 0,
        amount: s.totalAmount || s.billingAmount || 0,
        user: {
          id: s.userId?._id || s.userId || '',
          name: s.userName || s.userId?.name || 'User',
        },
        lastPreview: s.lastMessagePreview || s.lastMessage || 'Chat session',
        lastInteractionAt: s.lastInteractionAt || s.endTime || s.startTime,
      }));

      // Normalize call sessions
      const callMapped = callItems.map((s) => ({
        id: s.sessionId || s._id,
        orderId: s.orderId,
        type: 'call', // ✅ Explicitly setting 'call' type
        status: s.status,
        startedAt: s.startTime,
        endedAt: s.endTime,
        durationSeconds: s.duration || 0,
        amount: s.totalAmount || s.billingAmount || 0,
        user: {
          id: s.userId?._id || s.userId || '',
          name: s.userName || s.userId?.name || 'User',
        },
        lastPreview: s.callType ? `${s.callType.toUpperCase()} call` : 'Call session',
        lastInteractionAt: s.lastInteractionAt || s.endTime || s.startTime,
      }));

      const all = [...chatMapped, ...callMapped].sort((a, b) => {
        const t1 = new Date(a.lastInteractionAt || a.startedAt || 0).getTime();
        const t2 = new Date(b.lastInteractionAt || b.startedAt || 0).getTime();
        return t2 - t1;
      });

      const totalEarned = all.reduce((sum, s) => sum + (s.amount || 0), 0);

      return {
        success: true,
        data: {
          sessions: all,
          totalEarned,
          chatCount: chatMapped.length,
          callCount: callMapped.length,
        },
      };
    } catch (error) {
      console.error('❌ [AstroOrders] getAstrologerSessions error:', error);
      throw error;
    }
  }
}

const astrologerOrderService = new AstrologerOrderService();
export default astrologerOrderService;