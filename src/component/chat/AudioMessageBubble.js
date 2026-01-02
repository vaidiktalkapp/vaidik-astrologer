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

export default function AudioMessageBubble({
  url,
  durationSec = 0,
  isOutgoing = false,      // ✅ renamed
  bubbleBg,                // optional: pass bubble bg for better contrast decisions
}) {
  const ref = useRef(null);

  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec || 0);

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const effectiveDuration = duration || durationSec || 0;
  const effectiveCurrent = isSeeking ? seekValue : current;

  const progressPct = useMemo(() => {
    if (!effectiveDuration) return 0;
    return Math.max(0, Math.min(1, effectiveCurrent / effectiveDuration));
  }, [effectiveCurrent, effectiveDuration]);

  // Show remaining when playing; total when paused
  const displayTime = useMemo(() => {
    if (!effectiveDuration) return '00:00';
    const timeToShow = paused
      ? effectiveDuration
      : Math.max(0, effectiveDuration - effectiveCurrent);
    return formatTime(timeToShow);
  }, [paused, effectiveDuration, effectiveCurrent]);

  const handleSeekComplete = (value) => {
    ref.current?.seek?.(value);
    setCurrent(value);
    setIsSeeking(false);
  };

  // Colors tuned for your bubble backgrounds (white + light purple)
  const trackBg = 'rgba(0,0,0,0.12)';      // visible on white + purple
  const trackFill = '#5A2CCF';             // purple fill
  const timeColor = '#4B5563';             // readable on white + purple
  const playIconColor = isOutgoing ? '#372643' : '#5A2CCF';

  const THUMB = 12;
  const thumbLeft = Math.max(
    0,
    Math.min(trackWidth - THUMB, progressPct * trackWidth - THUMB / 2)
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setPaused(p => !p)}
        style={[styles.playBtn, isOutgoing ? styles.playBtnOutgoing : styles.playBtnIncoming]}
        activeOpacity={0.7}
      >
        <Ionicons
          name={paused ? 'play' : 'pause'}
          size={20}
          color={playIconColor}
        />
      </TouchableOpacity>

      <View style={styles.right}>
        <View
          style={styles.trackWrap}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          {/* Thick custom track */}
          <View style={[styles.trackBg, { backgroundColor: trackBg }]} />
          <View
            style={[
              styles.trackFill,
              { backgroundColor: trackFill, width: `${progressPct * 100}%` },
            ]}
          />

          {/* Custom thumb so it’s always visible */}
          <View
            style={[
              styles.thumb,
              { left: thumbLeft, backgroundColor: trackFill },
            ]}
          />

          {/* Slider for gestures only (nearly invisible) */}
          <Slider
            value={effectiveCurrent}
            minimumValue={0}
            maximumValue={effectiveDuration || 1}
            onSlidingStart={() => {
              setIsSeeking(true);
              setSeekValue(effectiveCurrent);
            }}
            onValueChange={(v) => setSeekValue(v)}
            onSlidingComplete={handleSeekComplete}
            minimumTrackTintColor="transparent"
            maximumTrackTintColor="transparent"
            thumbTintColor="transparent"
            style={styles.sliderOverlay}
          />
        </View>

        <Text style={[styles.durationText, { color: timeColor }]}>
          {displayTime}
        </Text>
      </View>

      <Video
        ref={ref}
        source={{ uri: url }}
        paused={paused}
        audioOnly
        playInBackground={false}
        playWhenInactive={false}
        onLoad={(e) => setDuration(e?.duration || durationSec || 0)}
        onProgress={(e) => {
          if (!isSeeking) setCurrent(e?.currentTime || 0);
        }}
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
    paddingVertical: 6,
    paddingHorizontal: 6,
    minWidth: 220,
  },

  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  // Incoming (left bubble - white)
  playBtnIncoming: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  // Outgoing (right bubble - light purple)
  playBtnOutgoing: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },

  right: { flex: 1, marginLeft: 10 },

  trackWrap: {
    height: 26,
    justifyContent: 'center',
  },
  trackBg: {
    height: 6,
    borderRadius: 999,
    width: '100%',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 999,
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    top: '50%',
    marginTop: -6,
  },

  // Almost invisible slider (touch only)
  sliderOverlay: {
    position: 'absolute',
    left: -10,
    right: -10,
    height: 44,
    opacity: 0.02,
  },

  durationText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    alignSelf: 'flex-end',
  },
});
