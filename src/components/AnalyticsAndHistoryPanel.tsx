import React, { useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  Bike,
  Edit3,
  Filter,
  Play,
  Plus,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  DayPeriod,
  DeliveryAppName,
  DeliveryFilterState,
  DeliveryRecord,
} from '../types';
import {
  DAY_PERIOD_LABELS,
  formatCurrency,
  formatDurationCompact,
  formatKm,
} from '../utils/geoAndSound';

interface AnalyticsAndHistoryPanelProps {
  deliveries: DeliveryRecord[];
  costPerKm: number;
  filters: DeliveryFilterState;
  onUpdateFilters: (patch: Partial<DeliveryFilterState>) => void;
  onAddManualDelivery: () => void;
  onEditDelivery: (record: DeliveryRecord) => void;
  onDeleteDelivery: (id: string) => void;
  onReplayDelivery: (record: DeliveryRecord) => void;
}

export const AnalyticsAndHistoryPanel: React.FC<
  AnalyticsAndHistoryPanelProps
> = ({
  deliveries,
  costPerKm,
  filters,
  onUpdateFilters,
  onAddManualDelivery,
  onEditDelivery,
  onDeleteDelivery,
  onReplayDelivery,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Calculate KM totals for Today, Week, Month, and All-Time (unfiltered overview)
  const kmBreakdown = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).getTime();

    let todayKm = 0;
    let weekKm = 0;
    let monthKm = 0;
    let totalKm = 0;

    deliveries.forEach((d) => {
      const ts = new Date(d.date).getTime();
      totalKm += d.distanceKm;
      if (ts >= startOfToday) todayKm += d.distanceKm;
      if (ts >= sevenDaysAgo) weekKm += d.distanceKm;
      if (ts >= startOfMonth) monthKm += d.distanceKm;
    });

    return { todayKm, weekKm, monthKm, totalKm };
  }, [deliveries]);

  // Apply interactive filters
  const filteredDeliveries = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = startOfToday - 29 * 24 * 60 * 60 * 1000;

    return deliveries
      .filter((d) => {
        const ts = new Date(d.date).getTime();
        if (filters.periodRange === 'today' && ts < startOfToday) return false;
        if (filters.periodRange === 'week' && ts < sevenDaysAgo) return false;
        if (filters.periodRange === 'month' && ts < thirtyDaysAgo) return false;

        if (filters.app !== 'all' && d.app !== filters.app) return false;
        if (filters.dayPeriod !== 'all' && d.periodOfDay !== filters.dayPeriod)
          return false;

        const gross = d.baseValue + d.tipValue;
        if (filters.minValue > 0 && gross < filters.minValue) return false;

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [deliveries, filters]);

  // Aggregate metrics for filtered deliveries
  const stats = useMemo(() => {
    let baseSum = 0;
    let tipSum = 0;
    let kmSum = 0;
    let durationSum = 0;

    const byApp: Record<
      DeliveryAppName,
      { count: number; gross: number; net: number }
    > = {
      iFood: { count: 0, gross: 0, net: 0 },
      'Uber Eats': { count: 0, gross: 0, net: 0 },
      Rappi: { count: 0, gross: 0, net: 0 },
      Outro: { count: 0, gross: 0, net: 0 },
    };

    const byPeriod: Record<DayPeriod, { count: number; gross: number }> = {
      manha: { count: 0, gross: 0 },
      almoco: { count: 0, gross: 0 },
      tarde: { count: 0, gross: 0 },
      jantar: { count: 0, gross: 0 },
      madrugada: { count: 0, gross: 0 },
    };

    const byZone: Record<
      string,
      { zone: string; count: number; gross: number; net: number; km: number }
    > = {};

    filteredDeliveries.forEach((d) => {
      const gross = d.baseValue + d.tipValue;
      const cost = d.distanceKm * costPerKm;
      const net = gross - cost;

      baseSum += d.baseValue;
      tipSum += d.tipValue;
      kmSum += d.distanceKm;
      durationSum += d.durationSeconds;

      if (byApp[d.app]) {
        byApp[d.app].count += 1;
        byApp[d.app].gross += gross;
        byApp[d.app].net += net;
      }

      if (byPeriod[d.periodOfDay]) {
        byPeriod[d.periodOfDay].count += 1;
        byPeriod[d.periodOfDay].gross += gross;
      }

      const zKey = (d.zoneName || 'Centro').trim();
      if (!byZone[zKey]) {
        byZone[zKey] = { zone: zKey, count: 0, gross: 0, net: 0, km: 0 };
      }
      byZone[zKey].count += 1;
      byZone[zKey].gross += gross;
      byZone[zKey].net += net;
      byZone[zKey].km += d.distanceKm;
    });

    const count = filteredDeliveries.length;
    const grossTotal = baseSum + tipSum;
    const totalCost = kmSum * costPerKm;
    const netTotal = grossTotal - totalCost;
    const avgPerDelivery = count > 0 ? grossTotal / count : 0;
    const grossPerKm = kmSum > 0 ? grossTotal / kmSum : 0;
    const netPerKm = kmSum > 0 ? netTotal / kmSum : 0;

    const topZones = Object.values(byZone).sort((a, b) => b.net - a.net);

    return {
      count,
      baseSum,
      tipSum,
      grossTotal,
      totalCost,
      netTotal,
      kmSum,
      durationSum,
      avgPerDelivery,
      grossPerKm,
      netPerKm,
      byApp,
      byPeriod,
      topZones,
    };
  }, [filteredDeliveries, costPerKm]);

  const maxAppGross = Math.max(
    1,
    ...Object.values(stats.byApp).map((x) => x.gross)
  );
  const maxPeriodGross = Math.max(
    1,
    ...Object.values(stats.byPeriod).map((x) => x.gross)
  );

  return (
    <div className="space-y-4">
      {/* Odômetro Geral de Quilometragem (Hoje, Semana, Mês, Geral) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bike className="w-4 h-4 text-emerald-500" />
            <span>Quilometragem Pedalada (Odômetro Bike)</span>
          </h2>
          <button
            type="button"
            onClick={onAddManualDelivery}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Entrega Manual</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: 'Hoje', value: kmBreakdown.todayKm },
            { label: 'Semana (7d)', value: kmBreakdown.weekKm },
            { label: 'Mês Atual', value: kmBreakdown.monthKm },
            { label: 'Total Geral', value: kmBreakdown.totalKm },
          ].map((item) => (
            <div
              key={item.label}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800"
            >
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                {item.label}
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block">
                {formatKm(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de Filtros de Desempenho */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-emerald-500" />
            <span>Filtros de Análise e Histórico</span>
          </h3>
          {(filters.periodRange !== 'all' ||
            filters.app !== 'all' ||
            filters.dayPeriod !== 'all' ||
            filters.minValue > 0) && (
            <button
              type="button"
              onClick={() =>
                onUpdateFilters({
                  periodRange: 'all',
                  app: 'all',
                  dayPeriod: 'all',
                  minValue: 0,
                })
              }
              className="text-xs text-emerald-500 hover:underline font-medium"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        {/* Período */}
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {[
            { id: 'today' as const, label: 'Hoje' },
            { id: 'week' as const, label: '7 Dias' },
            { id: 'month' as const, label: '30 Dias' },
            { id: 'all' as const, label: 'Tudo' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onUpdateFilters({ periodRange: tab.id })}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                filters.periodRange === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* App, Turno e Valor Mínimo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Aplicativo
            </label>
            <select
              value={filters.app}
              onChange={(e) =>
                onUpdateFilters({
                  app: e.target.value as DeliveryFilterState['app'],
                })
              }
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
            >
              <option value="all">Todos os Apps</option>
              <option value="iFood">iFood</option>
              <option value="Uber Eats">Uber Eats</option>
              <option value="Rappi">Rappi</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Horário do Dia
            </label>
            <select
              value={filters.dayPeriod}
              onChange={(e) =>
                onUpdateFilters({
                  dayPeriod: e.target.value as DeliveryFilterState['dayPeriod'],
                })
              }
              className="w-full min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
            >
              <option value="all">Todos os Horários</option>
              {(Object.keys(DAY_PERIOD_LABELS) as DayPeriod[]).map((k) => (
                <option key={k} value={k}>
                  {DAY_PERIOD_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Valor Mínimo: {formatCurrency(filters.minValue)}
            </label>
            <input
              type="range"
              min={0}
              max={40}
              step={2}
              value={filters.minValue}
              onChange={(e) =>
                onUpdateFilters({ minValue: Number(e.target.value) })
              }
              className="w-full h-[42px] accent-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Cards de Controle Financeiro (Bruto, Gorjetas, Custo Bike, Lucro Líquido) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">
            Lucro Líquido Real
          </span>
          <span className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1 block">
            {formatCurrency(stats.netTotal)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1 block">
            Custo Bike: -{formatCurrency(stats.totalCost)}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">
            Ganho Bruto Total
          </span>
          <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1 block">
            {formatCurrency(stats.grossTotal)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1 block">
            Corridas: {formatCurrency(stats.baseSum)} · Gorjetas:{' '}
            {formatCurrency(stats.tipSum)}
          </span>
        </div>

        <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex sm:block items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Eficiência ({stats.count} entregas)
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-amber-500 mt-1 block">
              {formatCurrency(stats.netPerKm)}/km líq.
            </span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums sm:mt-1 block">
            Média/entrega: {formatCurrency(stats.avgPerDelivery)}
          </span>
        </div>
      </div>

      {/* Gráficos Simples de Desempenho (Por App e Por Horário) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <span>Desempenho por Aplicativo</span>
          </h3>
          <div className="space-y-2.5">
            {(Object.keys(stats.byApp) as DeliveryAppName[]).map((appName) => {
              const row = stats.byApp[appName];
              const pct = Math.round((row.gross / maxAppGross) * 100);
              return (
                <div key={appName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {appName}{' '}
                      <span className="text-slate-400 font-normal">
                        ({row.count})
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
                      {formatCurrency(row.gross)}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${row.gross > 0 ? Math.max(6, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span>Ganhos por Turno do Dia</span>
          </h3>
          <div className="space-y-2.5">
            {(Object.keys(DAY_PERIOD_LABELS) as DayPeriod[]).map((pKey) => {
              const row = stats.byPeriod[pKey];
              const pct = Math.round((row.gross / maxPeriodGross) * 100);
              return (
                <div key={pKey} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {DAY_PERIOD_LABELS[pKey]}{' '}
                      <span className="text-slate-400">({row.count})</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
                      {formatCurrency(row.gross)}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      style={{ width: `${row.gross > 0 ? Math.max(6, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ranking das Zonas Mais Lucrativas */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-amber-400" />
          <span>Ranking das Zonas Mais Lucrativas</span>
        </h3>
        {stats.topZones.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
            Nenhuma zona registrada no período selecionado. Inicie uma entrega
            ou adicione manualmente para descobrir quais bairros pagam melhor
            por km pedalado.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.topZones.slice(0, 5).map((z, idx) => (
              <div
                key={z.zone}
                className="py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                    {idx + 1}º
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {z.zone}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {z.count} entregas · {formatKm(z.km)}
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                    {formatCurrency(z.net)} líq.
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    {z.km > 0 ? formatCurrency(z.net / z.km) : 'R$ 0,00'}/km
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista Histórica de Entregas com Replay, Edição e Exclusão */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Histórico de Entregas ({filteredDeliveries.length})
          </h3>
        </div>

        {filteredDeliveries.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nenhuma entrega registrada ainda.
            </p>
            <button
              type="button"
              onClick={onAddManualDelivery}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Primeira Entrega</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredDeliveries.map((del) => {
              const gross = del.baseValue + del.tipValue;
              const cost = del.distanceKm * costPerKm;
              const net = gross - cost;
              const hasReplay = del.routePath && del.routePath.length >= 2;

              return (
                <div
                  key={del.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {del.app}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        {del.zoneName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-400 font-mono tabular-nums">
                        {new Date(del.date).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-1.5">
                      <span>{formatKm(del.distanceKm)}</span>
                      <span>·</span>
                      <span>{formatDurationCompact(del.durationSeconds)}</span>
                      <span>·</span>
                      <span>Bruto: {formatCurrency(gross)}</span>
                      {del.tipValue > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-amber-500">
                            Gorjeta: {formatCurrency(del.tipValue)}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        Líq: {formatCurrency(net)}
                      </span>
                    </div>

                    {del.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                        “{del.notes}”
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    {hasReplay && (
                      <button
                        type="button"
                        onClick={() => onReplayDelivery(del)}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 text-xs font-semibold flex items-center gap-1"
                        title="Reproduzir replay do trajeto no mapa"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Replay</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onEditDelivery(del)}
                      className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                      title="Editar entrega"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {confirmDeleteId === del.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteDelivery(del.id);
                          setConfirmDeleteId(null);
                        }}
                        className="min-h-[38px] px-2.5 rounded-xl bg-red-600 text-white text-xs font-bold"
                      >
                        Confirmar?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(del.id)}
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-500/15 text-slate-500 hover:text-red-400 flex items-center justify-center"
                        title="Excluir entrega"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
