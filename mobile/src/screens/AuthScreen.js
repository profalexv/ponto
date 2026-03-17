import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { authEmployee } from '../api';
import { saveSession } from '../storage';

export default function AuthScreen({ onLogin }) {
  const [orgId,      setOrgId]      = useState('');
  const [identifier, setIdentifier] = useState('');
  const [pin,        setPin]        = useState('');
  const [loading,    setLoading]    = useState(false);

  async function handleLogin() {
    const org  = orgId.trim();
    const iden = identifier.trim();
    const p    = pin.trim();

    if (!org || !iden || !p) {
      Alert.alert('Campos obrigatórios', 'Preencha o ID da empresa, CPF/e-mail e PIN.');
      return;
    }

    setLoading(true);
    try {
      const data = await authEmployee(org, iden, p);
      await saveSession({
        token:       data.token,
        employeeId:  data.employeeId,
        name:        data.name,
        orgId:       org,
        orgName:     data.orgName,
        gpsConsent:  data.gpsConsent,
      });
      onLogin();
    } catch (e) {
      Alert.alert('Falha ao entrar', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>⏱️</Text>
        <Text style={styles.title}>Ponto Jornada</Text>
        <Text style={styles.subtitle}>Registre sua jornada de trabalho</Text>

        <View style={styles.card}>
          <Text style={styles.label}>ID da Empresa</Text>
          <TextInput
            style={styles.input}
            placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx"
            placeholderTextColor="#94a3b8"
            value={orgId}
            onChangeText={setOrgId}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={styles.label}>CPF ou E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="000.000.000-00 ou nome@empresa.com"
            placeholderTextColor="#94a3b8"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="PIN numérico cadastrado pelo RH"
            placeholderTextColor="#94a3b8"
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Entrar</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          O ID da empresa é fornecido pelo administrador do sistema.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:       { flex: 1, backgroundColor: '#f8fafc' },
  inner:      { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo:       { fontSize: 60, textAlign: 'center', marginBottom: 8 },
  title:      { fontSize: 28, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  subtitle:   { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 32, marginTop: 4 },
  card:       {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  label:      { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 16, marginBottom: 6 },
  input:      {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  btn:        {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint:       { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
