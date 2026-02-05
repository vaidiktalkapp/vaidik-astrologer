import notifee, { 
  AndroidImportance, 
  AndroidCategory, 
  AndroidVisibility,
  AndroidStyle 
} from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';

class NotificationManager {
  constructor() {
    this.navigationRef = null;
  }

  setNavigation(ref) {
    this.navigationRef = ref;
  }

  async setup() {
    await this.requestPermissions();
    await this.createChannels();
  }

  async requestPermissions() {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    await messaging().requestPermission();
  }

  async createChannels() {
    try {
      // 1. URGENT REQUESTS (Calls & Chat Requests) - Loud Ringtone
      // ✅ CHANGED ID to 'v7' to force system to update sound settings
      await notifee.createChannel({
        id: 'astro_urgent_v7', 
        name: 'Incoming Requests',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'call_ringtone', // Make sure this file exists in android/app/src/main/res/raw
        vibration: true,
        vibrationPattern: [300, 500, 300, 500],
        bypassDnd: true,
      });

  await notifee.createChannel({
  id: 'astrologer_alert_v1',
  name: 'Live Stream Notifications',
  importance: AndroidImportance.HIGH, // MUST BE HIGH
});

      // 2. CHAT MESSAGES - Soft Tone
      await notifee.createChannel({
        id: 'astro_messages_v5',
        name: 'Chat Messages',
        importance: AndroidImportance.HIGH,
        sound: 'chat_tone', 
        vibration: true,
      });
      
      console.log('✅ Notification Channels Created');
    } catch (e) {
      console.error('❌ Channel Creation Failed:', e);
    }
  }

  // --- DISPLAY LOGIC ---

  async displayRequestNotification(data) {
    const { type, sessionId, userName, userProfilePic } = data;
    const isCall = type && type.includes('call');
    
    let hasValidImage = false;
    if (userProfilePic && typeof userProfilePic === 'string' && (userProfilePic.startsWith('http') || userProfilePic.startsWith('https'))) {
        hasValidImage = true;
    }

    const safeUserName = userName || 'User';

    try {
      await notifee.displayNotification({
        id: `req_${sessionId}`,
        title: isCall ? 'Incoming Call' : 'New Chat Request', // ✅ Title update
        body: `${safeUserName} is requesting to ${isCall ? 'call' : 'chat'}...`,
        data: data,
        android: {
          channelId: 'astro_urgent_v7', // ✅ Matches new Channel ID
          
          // ✅ Both Calls AND Chat Requests get "CALL" category to ring loudly/continuously
          category: AndroidCategory.CALL,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          
          smallIcon: 'ic_launcher',
          color: '#4CAF50',
          
          ...(hasValidImage && { largeIcon: userProfilePic }),
          
          ongoing: true, // Cannot be swiped away
          loopSound: true, // Rings continuously
          autoCancel: false,
          timeoutAfter: 45000, 

          // ✅ FULL SCREEN ACTION: This attempts to open the App from background/lock screen
          fullScreenAction: {
            id: 'default',
            launchActivity: 'default',
          },
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          
          actions: [
            { 
              title: 'Answer', 
              pressAction: { id: 'accept_request', launchActivity: 'default' } 
            },
            { 
              title: 'Reject', 
              pressAction: { id: 'reject_request' } 
            },
          ],
        },
      });
    } catch (e) {
      console.error('❌ Display Request Error:', e);
    }
  }

  async displayChatNotification(data) {
    const { sessionId, senderName, message } = data;
    try {
      await notifee.displayNotification({
        id: `msg_${sessionId}`,
        title: senderName || 'New Message',
        body: message || 'You have a new message',
        data: data,
        android: {
          channelId: 'astro_messages_v5',
          category: AndroidCategory.MESSAGE,
          pressAction: { id: 'view_chat', launchActivity: 'default' },
          style: { type: AndroidStyle.BIGTEXT, text: message || '' },
          smallIcon: 'ic_launcher',
        },
      });
    } catch (e) {
      console.error('❌ Display Chat Error:', e);
    }
  }

  async cancelNotification(id) {
    if(!id) return;
    try {
      await notifee.cancelNotification(id);
    } catch(e) {}
  }

  async cancelAll() {
    await notifee.cancelAllNotifications();
  }
}

export const notificationManager = new NotificationManager();