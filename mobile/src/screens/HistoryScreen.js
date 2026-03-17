import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getHistory } from '../api';
import { loadSession } from '../storage';

const TYPE_LABELS = {
  entrada:      { label: 'Entrada',      color: '#16a34a', bg: '#dcfce7' },
  saida:        { label: 'Saída',        color: '#dc2626', bg: '#fee2e2' },
  pausa_inicio: { label: 'Pausa',        color: '#d97706', bg: '#fef3c7' },
  pausa_fim:    { label: 'Fim de Pausa', color: '#7c3aed', bg: '#ede9fe' },
};

function fmtDatetime(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
}

// Agrupa registros por data para exibir cabeçalhos de seção
function groupByDate(records) {
  const groups = [];
  let currentDate = null;

  for (const r of records) {
    const date = r.punched_at.slice(0, 10);
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ type: 'header', id: `h-${date}`, date });
    }
    groups.push({ type: 'item', ...r });
  }
  return groups;
}

export default function HistoryScreen() {
  const [session,    setSession]   = useState(null);
  const [records,    setRecords]   = useState([]);
  const [nextCursor, setNextCursor]= useState(null);
  const [loading,    setLoading]   = useState(true);
  const [loadingMore,setLoadMore]  = useState(false);
  const [refreshing, setRefresh]   = useState(false);

  const loadData = useCallback(async (sess, cursor = null, append = false) => {
    if (!sess) return;
    try {
      const result = await getHistory(sess.token, cursor);
      setRecords(prev => append ? [...prev, ...result.data] : result.data);
      setNextCursor(result.nextCursor || null);
    } catch (e) {
      // silencia — a HomeScreen trata expiração de sessão
    }
  }, []);

  useEffect(() => {
    (async () => {
      const sess = await loadSession();
      setSession(sess);
      await loadData(sess);
      setLoading(false);
    })();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    await loadData(session);
    setRefresh(false);
  }, [session, loadData]);

  const onLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadMore(true);
    await loadData(session, nextCursor, true);
    setLoadMore(false);
  }, [nextCursor, loadingMore, session, loadData]);

  const grouped = groupByDate(records);

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{fmtDate(item.date)}</Text>
        </View>
      );
    }

    const cfg       = TYPE_LABELS[item.type] || { label: item.type, color: '#6b7280', bg: '#f3f4f6' };
    const cancelled = item.cancelled === true;

    return (
      <View style={[styles.row, cancelled && styles.rowCancelled]}>
        <View style={[styles.dot, { backgroundColor: cfg.color, opacity: cancelled ? 0.4 : 1 }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.typeText, { color: cfg.color }, cancelled && styles.cancelledText]}>
            {cfg.label}{cancelled ? '  (cancelado)' : ''}
          </Text>
        </View>
        <Text style={[styles.timeText, cancelled && styles.cancelledText]}>
          {new Date(item.punched_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  const ListFooter = () => {
    if (loadingMore) {
      return <ActivityIndicator style={{ marginVertical: 16 }} color="#2563eb" />;
    }
    if (nextCursor) {
      return (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={onLoadMore}>
          <Text style={styles.loadMoreText}>Carregar mais</Text>
        </TouchableOpacity>
      );
    }
    if (records.length > 0) {
      return <Text style={styles.endText}>Todos os registros carregados</Text>;
    }
    return null;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Histórico</Text>
      </View>

      {records.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nenhum registro encontrado.</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={item => item.id ?? `${item.punched_at}-${item.type}`}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
          }
          ListFooterComponent={<ListFooter />}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: '#f1f5f9' },
  center:             { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle:        { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  list:               { flex: 1 },
  sectionHeader:      {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionHeaderText:  { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6 },
  row:                {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowCancelled:       { opacity: 0.55 },
  dot:                { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  typeText:           { fontSize: 14, fontWeight: '600' },
  cancelledText:      { textDecorationLine: 'line-through' },
  timeText:           { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  loadMoreBtn:        {
    margin: 16,
    borderRadius: 12,
    backgroundColor: '#e0e7ff',
    paddingVertical: 14,
    alignItems: 'center',
  },
  loadMoreText:       { color: '#2563eb', fontWeight: '700', fontSize: 14 },
  endText:            { textAlign: 'center', color: '#94a3b8', fontSize: 12, marginVertical: 20 },
  emptyText:          { fontSize: 15, color: '#94a3b8' },
});
