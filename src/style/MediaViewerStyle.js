import { StyleSheet, Platform, StatusBar, Dimensions } from 'react-native';
const { width } = Dimensions.get('window');

export const COLORS = {
  PRIMARY: '#1E3A8A',
  SECONDARY: '#1E40AF',
  ACCENT: '#FFC107',
  BG: '#000000',
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    // Position it safely below the notch/status bar
    top: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 50,
    left: 20,
    zIndex: 999,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  playButton: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  playCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
videoControlsBottom: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.4)', // Darker background for visibility
  },
  timerText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', // Fixed width numbers
    width: 45,
    textAlign: 'center',
  },
  progressBarWrapper: {
    flex: 1,
    height: 30, // Large touch area for easier seeking
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFC107', // Use COLORS.ACCENT here
    borderRadius: 2,
  },
  progressKnob: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFC107',
    marginLeft: -7, // Centers the knob on the current percentage
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 3,
  }
});