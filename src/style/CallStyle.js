import { StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const COLORS = {
  PRIMARY: '#372643',      
  ACCENT: '#FFC107',       
  BG: '#1A1625',           
  BG_GRADIENT: '#2D2438', 
  DANGER: '#FF453A',
  SUCCESS: '#4CD964',
  SURFACE: 'rgba(255, 193, 7, 0.08)',
};

export const styles = StyleSheet.create({
  flex1: { flex: 1 },
  
  // --- AUDIO CALL STYLES ---
  audioContainer: { flex: 1, alignItems: 'center' },
  audioHeader: { width: '100%', alignItems: 'center', marginTop: 20 },
  topSection: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', paddingBottom: 100 },
  
  pulseContainer: { justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
  pulseRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: COLORS.ACCENT,
    opacity: 0.3,
  },
  avatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: COLORS.ACCENT,
    overflow: 'hidden',
    elevation: 10,
    backgroundColor: COLORS.BG_GRADIENT,
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarImage: { width: '100%', height: '100%' },
  
  nameText: { fontSize: 26, color: '#FFF', fontWeight: '700', marginBottom: 8 },
  statusText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500', marginBottom: 20 },
  
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  infoText: { color: COLORS.ACCENT, fontWeight: '700', marginLeft: 4 },

  // --- VIDEO CALL STYLES ---
  fullScreen: { width: width, height: height, backgroundColor: '#000' },
  
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },
  loadingRing: { marginBottom: 20 },
  waitText: { color: '#888', fontSize: 16, marginTop: 10 },

  // Top Overlay
  topOverlayFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    // Increased padding for Android to clear the status bar
    paddingTop: Platform.OS === 'android' ? 50 : 15, 
  },
  
  timerPill: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Slightly darker for better legibility
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 25, 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'flex-start', // Forces it to the left
  },

  btnOff: {
    backgroundColor: '#FFFFFF',
    elevation: 4, // Add a little shadow to the white button so it pops
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.DANGER, marginRight: 8 },
  timerText: { color: '#FFF', fontWeight: '700', fontVariant: ['tabular-nums'] },

  remoteInfo: { alignItems: 'flex-end' },
  remoteName: { color: '#FFF', fontSize: 16, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  remoteStatusContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.SUCCESS, marginRight: 6 },
  remoteStatus: { color: '#DDD', fontSize: 12 },

  // Small Floating Video (PiP)
  smallVideoContainer: {
    position: 'absolute',
    bottom: 140, // Above controls
    right: 20,
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 10,
    backgroundColor: '#333',
  },
  placeholderSmall: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },

  // --- CONTROLS (Common) ---
  controlsContainer: { position: 'absolute', bottom: 0, width: '100%', height: 130 },
  controlsGradient: { width: '100%', height: '100%', justifyContent: 'flex-end', paddingBottom: 30 },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingHorizontal: 20 },
  
  btn: { width: 55, height: 55, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(10px)' }, 
  
  hangupBtn: { width: 65, height: 65, borderRadius: 35, backgroundColor: COLORS.DANGER, justifyContent: 'center', alignItems: 'center', elevation: 5 },
});