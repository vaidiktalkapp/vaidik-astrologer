// src/navigation/AppNavigation.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { CardStyleInterpolators } from '@react-navigation/stack';

// Screens
import RootTabNavigator from './RootTabNavigation';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import OTPScreen from '../screens/auth/OTPScreen';

// Registration Screens
import PhoneNumberScreen from '../screens/registration/PhoneNumberScreen';
import OtpVerificationScreen from '../screens/registration/OtpVerificationScreen';
import RegistrationFormScreen from '../screens/registration/RegistrationFormScreen';
import ThankYouScreen from '../screens/registration/ThankYouScreen';
import CheckStatusScreen from '../screens/registration/CheckStatusScreen';
import InterviewDashboardScreen from '../screens/registration/InterviewDashboardScreen';

// Main Screens
import EditProfileScreen from '../screens/main_screens/EditProfileScreen';
import LiveStreamScreen from '../screens/livestream/LiveStream';
import MyServicesScreen from '../screens/main_screens/MyServices';
import AccountSetting from '../screens/main_screens/AccountSetting';
import AvailabilityManagement from '../screens/main_screens/AvailabilityManagement';
import GoLiveSetupScreen from '../screens/livestream/GoLiveSetupScreen';
import StreamAnalyticsScreen from '../screens/livestream/StreamAnalyticsScreen';
import MyStreamsScreen from '../screens/livestream/MyStreamsScreen';
import AstroChatRoom from '../screens/CallChatSection/AstroChatRoom';
import CallScreen from '../screens/CallChatSection/CallScreen';
import WalletWithdrawScreen from '../screens/wallet/WalletWithdrawScreen';
import HelpSupportScreen from '../screens/main_screens/HelpAndSupport';
import ChangeRequest from '../screens/main_screens/ChangeRequest';
import NotificationsScreen from '../screens/main_screens/NotificationScreen';
import PerformanceAnalysisScreen from '../screens/main_screens/PerformanceAnalysis';
import PayoutRequestsScreen from '../screens/wallet/PayoutRequestsScreen';
import PayoutDetailsScreen from '../screens/wallet/PayoutDetailsScreen';
import AddBankAccountScreen from '../screens/wallet/AddBankAccountScreen';
import AstroHistoryChatScreen from '../screens/CallChatSection/AstroHistoryChatScreen';
import SuggestRemediesScreen from '../screens/CallChatSection/SuggestRemediesScreen';
import AstrologerReviewsScreen from '../screens/CallChatSection/AstrologerReviewsScreen';
import AstrologerSuggestedRemediesScreen from '../screens/CallChatSection/AstrologerSuggestedRemediesScreen';
import MediaViewer from '../screens/CallChatSection/MediaViewer';

const Stack = createStackNavigator();

const AppNavigation = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
      }}
    >
      {/* ✅ Splash & Auth Screens */}
      <Stack.Screen 
        name="Splash" 
        component={SplashScreen}
        options={{ animationEnabled: false }}
      />
      
      <Stack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{ animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="OTP" 
        component={OTPScreen}
        options={{ animationEnabled: true }}
      />

      {/* ✅ Registration Flow */}
      <Stack.Screen 
        name="RegisterPhone" 
        component={PhoneNumberScreen}
        options={{ animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="RegisterOTP" 
        component={OtpVerificationScreen}
        options={{ animationEnabled: true }}
      />

      <Stack.Screen 
        name="RegisterForm" 
        component={RegistrationFormScreen}
        options={{ animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="ThankYou" 
        component={ThankYouScreen}
        options={{ animationEnabled: false }}
      />
      
      <Stack.Screen 
        name="CheckStatus" 
        component={CheckStatusScreen}
        options={{ animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="InterviewDashboard" 
        component={InterviewDashboardScreen}
        options={{ animationEnabled: true }}
      />

      {/* ✅ Communication Screens */}
      <Stack.Screen 
        name="AstroChatRoom" 
        component={AstroChatRoom}
        options={{ headerShown: false, animationEnabled: true }}
      />

      <Stack.Screen 
        name="AstroHistoryChat" 
        component={AstroHistoryChatScreen}
        options={{ headerShown: false, animationEnabled: true }}
      />

      <Stack.Screen 
        name="MediaViewer" 
        component={MediaViewer}
        options={{ headerShown: false, animationEnabled: true }}
      />

      <Stack.Screen 
        name="SuggestRemedies" 
        component={SuggestRemediesScreen}
        options={{ headerShown: false, animationEnabled: true }}
      />

      <Stack.Screen 
        name="AstrologerReviews" 
        component={AstrologerReviewsScreen}
        options={{ headerShown: true, animationEnabled: true }}
      />

      <Stack.Screen 
        name="AstrologerSuggestedRemedies" 
        component={AstrologerSuggestedRemediesScreen}
        options={{ headerShown: false, animationEnabled: true }}
      />

      <Stack.Screen 
        name="CallScreen" 
        component={CallScreen}
        options={{ headerShown: false, animationEnabled: true }}
      />

      {/* ✅ Main App (Authenticated) */}
      <Stack.Screen 
        name="Home" 
        component={RootTabNavigator}
        options={{ animationEnabled: false }}
      />
      
      <Stack.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{ headerShown: true, animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="GoLiveSetup" 
        component={GoLiveSetupScreen}
        options={{
          headerShown: true,
          title: 'Go Live Setup',
          headerBackTitle: 'Cancel',
          animationEnabled: true,
          cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
        }}
      />
      
      <Stack.Screen 
        name="StreamAnalytics" 
        component={StreamAnalyticsScreen}
        options={{ headerShown: false, animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="MyStreams" 
        component={MyStreamsScreen}
        options={{ headerShown: false, animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="Go-Live" 
        component={LiveStreamScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
          cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
        }}
      />
      
      <Stack.Screen 
        name="Services" 
        component={MyServicesScreen}
        options={{ headerShown: true, title: 'My Services', animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="Setting" 
        component={AccountSetting}
        options={{ headerShown: true, title: 'Account Settings', animationEnabled: true }}
      />
      
      <Stack.Screen 
        name="Availability" 
        component={AvailabilityManagement}
        options={{ headerShown: true, title: 'Availability', animationEnabled: true }}
      />

      {/* ✅ Wallet & Finance */}

      <Stack.Screen 
        name="WalletWithdraw" 
        component={WalletWithdrawScreen}
        options={{ headerShown: true, title: 'Withdraw Funds', animationEnabled: true }}
      />

      <Stack.Screen 
  name="AddBankAccount" 
  component={AddBankAccountScreen}
  options={{ headerShown: true }}
/>
<Stack.Screen 
  name="PayoutRequests" 
  component={PayoutRequestsScreen}
  options={{ headerShown: true }}
/>

<Stack.Screen 
  name="PayoutDetails" 
  component={PayoutDetailsScreen}
  options={{ headerShown: true }}
/>

      {/* ✅ Support & Other */}
      <Stack.Screen 
        name="HelpSupport" 
        component={HelpSupportScreen}
        options={{ headerShown: true, title: 'Help & Support', animationEnabled: true }}
      />

      <Stack.Screen 
        name="ChangeRequest" 
        component={ChangeRequest}
        options={{ headerShown: true, title: 'Change Request', animationEnabled: true }}
      />

      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{ headerShown: false, title: 'Notifications', animationEnabled: true }}
      />

      <Stack.Screen 
        name="PerformanceAnalysis" 
        component={PerformanceAnalysisScreen}
        options={{ headerShown: true, title: 'Performance Analysis', animationEnabled: true }}
      />

    </Stack.Navigator>
  );
};

export default AppNavigation;
