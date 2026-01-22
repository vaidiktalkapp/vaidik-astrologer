// src/utils/permissions.js

import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

// ===== CAMERA PERMISSION =====

/**
 * Request Camera Permission
 */
export const requestCameraPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'VaidikTalk needs access to your camera to take photos',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('✅ Camera permission granted');
        return true;
      } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        console.log('⚠️ Camera permission permanently denied');
        return false;
      } else {
        console.log('❌ Camera permission denied');
        return false;
      }
    } catch (err) {
      console.warn('Camera permission error:', err);
      return false;
    }
  } else {
    // iOS
    const result = await check(PERMISSIONS.IOS.CAMERA);
    if (result === RESULTS.GRANTED) {
      return true;
    }
    
    const requestResult = await request(PERMISSIONS.IOS.CAMERA);
    
    if (requestResult === RESULTS.BLOCKED) {
      showPermissionDeniedAlert('Camera');
      return false;
    }
    
    return requestResult === RESULTS.GRANTED;
  }
};

// ===== GALLERY PERMISSION =====

/**
 * Request Gallery Permission
 */
export const requestGalleryPermission = async () => {
  if (Platform.OS === 'android') {
    const permission = Platform.Version >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    try {
      const granted = await PermissionsAndroid.request(permission, {
        title: 'Gallery Permission',
        message: 'VaidikTalk needs access to your photos',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      });

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('✅ Gallery permission granted');
        return true;
      } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        console.log('⚠️ Gallery permission permanently denied');
        return false;
      } else {
        console.log('❌ Gallery permission denied');
        return false;
      }
    } catch (err) {
      console.warn('Gallery permission error:', err);
      return false;
    }
  } else {
    // iOS
    const result = await check(PERMISSIONS.IOS.PHOTO_LIBRARY);
    if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) {
      return true;
    }
    
    const requestResult = await request(PERMISSIONS.IOS.PHOTO_LIBRARY);
    
    if (requestResult === RESULTS.BLOCKED) {
      showPermissionDeniedAlert('Photos');
      return false;
    }
    
    return requestResult === RESULTS.GRANTED || requestResult === RESULTS.LIMITED;
  }
};

export const requestNotificationPermission = async () => {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Notification permission error:', err);
      return false;
    }
  }
  return true; // iOS handles this via APNS setup, or < 33 doesn't need runtime
};

// ===== REQUEST BOTH CAMERA AND GALLERY =====

/**
 * Request both Camera and Gallery permissions
 * Used when user wants to upload profile picture
 */
export const requestAllMediaPermissions = async () => {
  try {
    console.log('📸 Requesting Camera and Gallery permissions...');

    if (Platform.OS === 'android') {
      // Request both permissions at once on Android
      const permissions = [PermissionsAndroid.PERMISSIONS.CAMERA];
      
      if (Platform.Version >= 33) {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      } else {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      const cameraGranted = granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
      const galleryGranted = granted[permissions[1]] === PermissionsAndroid.RESULTS.GRANTED;

      console.log('📋 Camera:', cameraGranted ? 'Granted' : 'Denied');
      console.log('📋 Gallery:', galleryGranted ? 'Granted' : 'Denied');

      return {
        camera: cameraGranted,
        gallery: galleryGranted,
        allGranted: cameraGranted && galleryGranted,
      };
    } else {
      // iOS - request sequentially
      const [cameraResult, galleryResult] = await Promise.all([
        request(PERMISSIONS.IOS.CAMERA),
        request(PERMISSIONS.IOS.PHOTO_LIBRARY),
      ]);

      const cameraGranted = cameraResult === RESULTS.GRANTED;
      const galleryGranted = galleryResult === RESULTS.GRANTED || galleryResult === RESULTS.LIMITED;

      console.log('📋 Camera:', cameraGranted ? 'Granted' : 'Denied');
      console.log('📋 Gallery:', galleryGranted ? 'Granted' : 'Denied');

      // Show alert if any permission is blocked
      if (cameraResult === RESULTS.BLOCKED || galleryResult === RESULTS.BLOCKED) {
        showPermissionDeniedAlert('Camera and Photos');
      }

      return {
        camera: cameraGranted,
        gallery: galleryGranted,
        allGranted: cameraGranted && galleryGranted,
      };
    }
  } catch (error) {
    console.error('❌ Error requesting media permissions:', error);
    return {
      camera: false,
      gallery: false,
      allGranted: false,
    };
  }
};

// ===== CHECK PERMISSIONS STATUS =====

/**
 * Check if media permissions are already granted
 */
export const checkMediaPermissions = async () => {
  try {
    if (Platform.OS === 'android') {
      const cameraGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );

      const permission = Platform.Version >= 33
        ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

      const galleryGranted = await PermissionsAndroid.check(permission);

      return {
        camera: cameraGranted,
        gallery: galleryGranted,
        allGranted: cameraGranted && galleryGranted,
      };
    } else {
      const cameraStatus = await check(PERMISSIONS.IOS.CAMERA);
      const galleryStatus = await check(PERMISSIONS.IOS.PHOTO_LIBRARY);

      const cameraGranted = cameraStatus === RESULTS.GRANTED;
      const galleryGranted = galleryStatus === RESULTS.GRANTED || galleryStatus === RESULTS.LIMITED;

      return {
        camera: cameraGranted,
        gallery: galleryGranted,
        allGranted: cameraGranted && galleryGranted,
      };
    }
  } catch (err) {
    console.error('❌ Check permissions error:', err);
    return {
      camera: false,
      gallery: false,
      allGranted: false,
    };
  }
};


// ===== MICROPHONE PERMISSION =====

/**
 * Request Microphone Permission
 */
export const requestMicrophonePermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'VaidikTalk needs access to your microphone',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Microphone permission error:', err);
      return false;
    }
  } else {
    // iOS
    const result = await check(PERMISSIONS.IOS.MICROPHONE);
    if (result === RESULTS.GRANTED) {
      return true;
    }
    const requestResult = await request(PERMISSIONS.IOS.MICROPHONE);
    return requestResult === RESULTS.GRANTED;
  }
};

// ===== CAMERA + MICROPHONE (FOR VIDEO CALLS) =====

/**
 * Request Camera and Microphone permissions for video calls/livestreaming
 */
export const requestCameraAndMicPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);

      const cameraGranted = granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
      const micGranted = granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED;

      if (cameraGranted && micGranted) {
        return true;
      } else {
        Alert.alert(
          'Permissions Required',
          'Camera and microphone permissions are required for video calls.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return false;
      }
    } catch (err) {
      console.error('Permission error:', err);
      return false;
    }
  } else {
    // iOS
    try {
      const cameraStatus = await request(PERMISSIONS.IOS.CAMERA);
      const micStatus = await request(PERMISSIONS.IOS.MICROPHONE);

      if (cameraStatus === RESULTS.GRANTED && micStatus === RESULTS.GRANTED) {
        return true;
      } else {
        Alert.alert(
          'Permissions Required',
          'Camera and microphone permissions are required for video calls.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openURL('app-settings:'),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return false;
      }
    } catch (err) {
      console.error('Permission error:', err);
      return false;
    }
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Show alert when permission is permanently denied/blocked
 */
const showPermissionDeniedAlert = (permissionName) => {
  Alert.alert(
    `${permissionName} Permission Required`,
    `Please enable ${permissionName} permission in Settings to use this feature.`,
    [
      {
        text: 'Open Settings',
        onPress: () => {
          if (Platform.OS === 'ios') {
            Linking.openURL('app-settings:');
          } else {
            Linking.openSettings();
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
};

/**
 * Request all permissions needed for the app
 * Call this on app startup or registration
 */
export const requestAllAppPermissions = async () => {
  try {
    console.log('🔐 Requesting all app permissions...');

    const mediaPerms = await requestAllMediaPermissions();
    const locationPerm = await requestLocationPermission();
    const micPerm = await requestMicrophonePermission();
    
    // ✅ ADDED: Explicitly call notification permission
    const notificationPerm = await requestNotificationPermission(); 

    console.log('📋 Permission Status:');
    console.log('  Camera:', mediaPerms.camera ? '✅' : '❌');
    console.log('  Gallery:', mediaPerms.gallery ? '✅' : '❌');
    console.log('  Location:', locationPerm ? '✅' : '❌');
    console.log('  Microphone:', micPerm ? '✅' : '❌');
    console.log('  Notifications:', notificationPerm ? '✅' : '❌');

    return {
      camera: mediaPerms.camera,
      gallery: mediaPerms.gallery,
      location: locationPerm,
      microphone: micPerm,
      notification: notificationPerm, // ✅ Add to return object
      allGranted: mediaPerms.camera && mediaPerms.gallery && locationPerm && micPerm && notificationPerm,
    };
  } catch (error) {
    console.error('❌ Error requesting all permissions:', error);
    return {
      camera: false,
      gallery: false,
      location: false,
      microphone: false,
      notification: false,
      allGranted: false,
    };
  }
};

export default {
  requestCameraPermission,
  requestGalleryPermission,
  requestAllMediaPermissions,
  checkMediaPermissions,
  requestLocationPermission,
  requestMicrophonePermission,
  requestCameraAndMicPermissions,
  requestAllAppPermissions,
};
