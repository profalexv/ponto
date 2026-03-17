import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { getMe, punch } from '../api';
import { loadSession, clearSession } from '../storage';

const TYPE_LABELS = {
  entrada:      { label: 'Entrada',      color: '#16a34a', bg: '#dcfce7' },
  saida:        { label: 'Saída',        color: '#dc2626', bg: '#fee2e2' },
  pausa_inicio: { label: 'Pausa',        color: '#d97706', bg: '#fef3c7' },
  pausa_fim:    { label: 'Fim de Pausa', color: '#7c3aed', bg: '#ede9fe' },
};

const PUNCH_ACTIONS = {
  entrada:      { label: 'Bater Entrada',  color: '#16a34a', darkColor: '#15803d' },
  saida:        { label: 'Bater Saída',    color: '#dc2626', darkColor: '#b91c1c' },
  pausa_inicio: { label: 'Iniciar Pausa',  color: '#d97706', darkColor: '#b45309' },
  pausa_fim:    { label: 'Fim de Pausa',   color: '#7c3aed', darkColor: '#6d28d9' },
};

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtNow() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function HomeScreen({ onLogout }) {
  const [session,   setSession]   = useState(null);
  const [me,        setMe]        = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [punching,  setPunching]  = useState(false);
  const [refreshing, setRefresh]  = useState(false);
  const [now,       setNow]       = useState(fmtNow());

  // Atualiza data/hora a cada minuto
  useEffect(() => {
    const t = setInterval(() => setNow(fmtNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchMe = useCallback(async (sess) => {
    try {
      const data = await getMe(sess.token);
      setMe(data);
    } catch (e) {
      if (e.message?.includes('expirado') || e.message?.includes('nválido')) {
        await clearSession();
        onLogout();
      }
    }
  }, [onLogout]);

  useEffect(() => {
    (async () => {
      const sess = await loadSession();
      setSession(sess);
      if (sess) await fetchMe(sess);
      setLoading(false);
    })();
  }, [fetchMe]);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    if (session) await fetchMe(session);
    setRefresh(false);
  }, [session, fetchMe]);

  async function handlePunch(type) {
    if (!session) return;
    setPunching(true);
    try {
      let lat = null, lon = null;
      if (session.gpsConsent) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
        }
      }
      const result = await punch(session.token, type, lat, lon);
      const hora   = fmtTime(result.punched_at);
      Alert.alert('✅ Ponto registrado', `${TYPE_LABELS[type]?.label} registrada às ${hora}.`);
      await fetchMe(session);
    } catch (e) {
      Alert.alert('Erro ao registrar ponto', e.message);
    } finally {
      setPunching(false);
    }
  }

  function confirmPunch(type) {
    const action = PUNCH_ACTIONS[type];
    Alert.alert(
      'Confirmar registro',
      `Deseja registrar ${action?.label?.toLowerCase()}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => handlePunch(type) },
      ]
    );
  }

  function handleLogout() {
    Alert.alert('Sair', 'Deseja encerrar sua sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair', style: 'destructive',
        onPress: async () => { await clearSession(); onLogout(); },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const nextActions = Array.isArray(me?.nextAction)
    ? me.nextAction
    : (me?.nextAction ? [me.nextAction] : []);

  const todayPunches = me?.todayPunches || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting} numberOfLines={1}>
            Olá, {session?.name?.split(' ')[0]} 👋
          </Text>
          <Text style={styles.orgName} numberOfLines={1}>{session?.orgName}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.logoutBtn}>Sair</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Data */}
        <Text style={styles.dateText}>{now}</Text>

        {/* Botões de ação */}
        {nextActions.length > 0 ? (
          nextActions.map(type => {
            const action = PUNCH_ACTIONS[type];
            return (
              <TouchableOpacity
                key={type}
                style={[styles.punchBtn, { backgroundColor: action?.color || '#2563eb' }]}
                onPress={() => confirmPunch(type)}
                disabled={punching}
                activeOpacity={0.88}
              >
                {punching
                  ? <ActivityIndicator color="#fff" size="large" />
                  : <Text style={styles.punchBtnText}>{action?.label || type}</Text>
                }
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={[styles.punchBtn, { backgroundColor: '#64748b' }]}>
            <Text style={styles.punchBtnText}>Jornada encerrada</Text>
          </View>
        )}

        {/* Registros de hoje */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Registros de Hoje</Text>

          {todayPunches.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum registro ainda hoje.</Text>
          ) : (
            todayPunches.map((r, i) => {
              const cfg = TYPE_LABELS[r.type] || { label: r.type, color: '#6b7280', bg: '#f3f4f6' };
              return (
                <View
                  key={r.id}
                  style={[styles.punchRow, i > 0 && styles.punchRowBorder]}
                >
                  <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  <Text style={styles.punchTime}>{fmtTime(r.punched_at)}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Legenda GPS */}
        {session?.gpsConsent && (
          <Text style={styles.gpsNote}>📍 Localização ativada nas suas batidas</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#f1f5f9' },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  header:        {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  greeting:      { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  orgName:       { fontSize: 12, color: '#64748b', marginTop: 2 },
  logoutBtn:     { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  dateText:      { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 16 },
  punchBtn:      {
    borderRadius: 18,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  punchBtnText:  { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  card:          {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle:     { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 },
  punchRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  punchRowBorder:{ borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  badge:         { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 'auto' },
  badgeText:     { fontSize: 13, fontWeight: '600' },
  punchTime:     { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptyText:     { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  gpsNote:       { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 16 },
});
