// src/screens/MediaViewer.js
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import ImageViewer from 'react-native-image-zoom-viewer';
import Video from 'react-native-video';

const { width, height } = Dimensions.get('window');

const COLORS = {
  PRIMARY: '#1E3A8A',
  SECONDARY: '#1E40AF',
  ACCENT: '#FFC107',
  BG: '#000000',
};

const MediaViewer = ({ route }) => {
  const navigation = useNavigation();
  const { mediaUrl, mediaType = 'image' } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);

  if (!mediaUrl) {
    Alert.alert('Error', 'No media URL provided');
    navigation.goBack();
    return null;
  }

  const handleBack = () => {
    navigation.goBack();
  };

  const togglePlayPause = () => {
    setPaused(!paused);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.BG} />
      
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Media Content */}
      {mediaType === 'video' ? (
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setShowControls(!showControls)}
          style={styles.videoContainer}
        >
          <Video
            source={{ uri: mediaUrl }}
            style={styles.video}
            resizeMode="contain"
            paused={paused}
            onLoad={() => setLoading(false)}
            onError={(error) => {
              console.error('Video error:', error);
              Alert.alert('Error', 'Failed to load video');
            }}
            controls={false}
            repeat
          />

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.ACCENT} />
            </View>
          )}

          {showControls && !loading && (
            <TouchableOpacity 
              style={styles.playButton} 
              onPress={togglePlayPause}
            >
              <View style={styles.playCircle}>
                <Ionicons 
                  name={paused ? 'play' : 'pause'} 
                  size={32} 
                  color="#FFF" 
                />
              </View>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ) : (
        <ImageViewer
          imageUrls={[{ url: mediaUrl }]}
          enableSwipeDown
          onSwipeDown={handleBack}
          backgroundColor={COLORS.BG}
          renderIndicator={() => null}
          loadingRender={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.ACCENT} />
            </View>
          )}
          enableImageZoom
          saveToLocalByLongPress={false}
          onClick={() => setShowControls(!showControls)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backButton: {
    padding: 16,
    alignSelf: 'flex-start',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  video: {
    width: width,
    height: height,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  playButton: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(30, 58, 138, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 193, 7, 0.8)',
  },
});

export default MediaViewer;
