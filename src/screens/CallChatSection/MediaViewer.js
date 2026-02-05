// src/screens/MediaViewer.js
import React, { useState, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Text,
  Dimensions,
} from 'react-native';
import ScreenWrapper from '../../component/ScreenWrapper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import ImageViewer from 'react-native-image-zoom-viewer';
import Video from 'react-native-video';
import { styles, COLORS } from '../../style/MediaViewerStyle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MediaViewer = ({ route }) => {
  const navigation = useNavigation();
  const videoRef = useRef(null);
  const { mediaUrl, mediaType = 'image' } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  
  // Video Progress State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSeek = (event) => {
    // Calculate seek position based on tap location on the X-axis
    const touchX = event.nativeEvent.locationX;
    const progressWidth = SCREEN_WIDTH - 120; // Accounting for side timers/padding
    const percentage = Math.max(0, Math.min(touchX / progressWidth, 1));
    const seekTime = percentage * duration;
    
    if (videoRef.current) {
      videoRef.current.seek(seekTime);
    }
  };

  return (
    <ScreenWrapper 
      backgroundColor="#000000" 
      barStyle="light-content" 
      translucent={true}
      safeAreaTop={false} 
      safeAreaBottom={false}
    >
      <View style={styles.container}>
        {mediaType === 'video' ? (
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={() => setShowControls(!showControls)}
            style={styles.videoContainer}
          >
            <Video
              ref={videoRef}
              source={{ uri: mediaUrl }}
              style={styles.video}
              resizeMode="contain"
              paused={paused}
              onLoad={(data) => {
                setDuration(data.duration);
                setLoading(false);
              }}
              onProgress={(data) => setCurrentTime(data.currentTime)}
              repeat
            />

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.ACCENT} />
              </View>
            )}

            {showControls && !loading && (
              <>
                <TouchableOpacity style={styles.playButton} onPress={() => setPaused(!paused)}>
                  <View style={styles.playCircle}>
                    <Ionicons name={paused ? 'play' : 'pause'} size={32} color="#FFF" />
                  </View>
                </TouchableOpacity>

                {/* VIDEO CONTROLS OVERLAY */}
                <View style={styles.videoControlsBottom}>
                  <Text style={styles.timerText}>{formatTime(currentTime)}</Text>
                  
                  {/* INTERACTIVE PROGRESS LINE */}
                  <TouchableOpacity 
                    style={styles.progressBarWrapper} 
                    activeOpacity={1}
                    onPress={handleSeek}
                  >
                    <View style={styles.progressBarBackground}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { width: `${(currentTime / duration) * 100}%` }
                        ]} 
                      />
                      {/* Interactive Knob */}
                      <View style={[styles.progressKnob, { left: `${(currentTime / duration) * 100}%` }]} />
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.timerText}>{formatTime(duration)}</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <ImageViewer
            imageUrls={[{ url: mediaUrl }]}
            enableSwipeDown
            onSwipeDown={() => navigation.goBack()}
            backgroundColor="#000"
            renderIndicator={() => null}
          />
        )}

        {showControls && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </ScreenWrapper>
  );
};

export default MediaViewer;