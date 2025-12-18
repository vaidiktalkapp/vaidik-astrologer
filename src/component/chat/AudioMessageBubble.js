import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Video from 'react-native-video';
import Slider from '@react-native-community/slider';

const formatTime = (sec = 0) => {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export default function AudioMessageBubble({ url, durationSec, isUser }) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec || 0);

  const displayTime = useMemo(() => {
    // Show remaining time when playing, total when paused
    const timeToShow = paused ? (duration || durationSec || 0) : (duration - current);
    return formatTime(timeToShow);
  }, [current, duration, durationSec, paused]);

  const handleSeek = (value) => {
    ref.current?.seek?.(value);
    setCurrent(value);
  };

  return (
    <View style={styles.container}>
      {/* Play/Pause Button */}
      <TouchableOpacity
        onPress={() => setPaused(p => !p)}
        style={[styles.playBtn, isUser ? styles.playBtnUser : styles.playBtnOther]}
        activeOpacity={0.7}
      >
        <Ionicons
          name={paused ? 'play' : 'pause'}
          size={20}
          color={isUser ? '#FFF' : '#5A2CCF'}
        />
      </TouchableOpacity>

      {/* Waveform/Slider + Duration */}
      <View style={styles.waveformContainer}>
        <Slider
          value={current}
          minimumValue={0}
          maximumValue={duration || 1}
          onSlidingComplete={handleSeek}
          minimumTrackTintColor={isUser ? '#B8A3FF' : '#5A2CCF'}
          maximumTrackTintColor={isUser ? 'rgba(255,255,255,0.3)' : '#DDD'}
          thumbTintColor={isUser ? '#FFF' : '#5A2CCF'}
          style={styles.slider}
        />
        <Text style={[styles.durationText, { color: isUser ? 'rgba(255,255,255,0.9)' : '#666' }]}>
          {displayTime}
        </Text>
      </View>

      {/* Hidden Video component for audio playback */}
      <Video
        ref={ref}
        source={{ uri: url }}
        paused={paused}
        audioOnly
        playInBackground={false}
        playWhenInactive={false}
        onLoad={(e) => setDuration(e?.duration || durationSec || 0)}
        onProgress={(e) => setCurrent(e?.currentTime || 0)}
        onEnd={() => {
          setPaused(true);
          setCurrent(0);
          ref.current?.seek?.(0);
        }}
        style={{ width: 0, height: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 200,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  playBtnUser: {
    backgroundColor: '#5A2CCF',
  },
  playBtnOther: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  waveformContainer: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  slider: {
    width: '100%',
    height: 30,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: -4,
    alignSelf: 'flex-end',
  },
});
