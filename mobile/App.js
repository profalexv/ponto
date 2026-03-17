import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadSession } from './src/storage';
import AuthScreen   from './src/screens/AuthScreen';
import HomeScreen   from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({ emoji }) {
  return <View><ActivityIndicator style={{ display: 'none' }} /><View>
    {/* Usa Text do RN dentro de um ícone de tab */}
  </View></View>;
}

function MainTabs({ onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopColor: '#e2e8f0' },
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          title: 'Início',
          tabBarIcon: ({ color }) => (
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              {/* ícone UTC nativo */}
            </View>
          ),
        }}
      >
        {() => <HomeScreen onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen
        name="History"
        options={{ title: 'Histórico' }}
        component={HistoryScreen}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(null); // null = carregando

  useEffect(() => {
    loadSession().then(sess => setLoggedIn(!!sess));
  }, []);

  if (loggedIn === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {loggedIn ? (
            <Stack.Screen name="Main">
              {() => <MainTabs onLogout={() => setLoggedIn(false)} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="Auth">
              {() => <AuthScreen onLogin={() => setLoggedIn(true)} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
