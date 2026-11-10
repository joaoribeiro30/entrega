import React, { useEffect, useState } from 'react';
import {
  Bike,
  Check,
  Clock,
  DollarSign,
  FileText,
  MapPin,
  Navigation,
  Sparkles,
  X,
} from 'lucide-react';
import {
  DayPeriod,
  DeliveryAppName,
  DeliveryRecord,
  RoutePoint,
} from '../types';
import {
  DAY_PERIOD_LABELS,
  formatCurrency,
  formatDuration,
  getDayPeriodFromDate,
} from '../utils/geoAndSound';

interface DeliveryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: DeliveryRecord) => void;
  initialData?: {
    editingRecord?: DeliveryRecord | null;
    trackedDistanceKm?: number;
    trackedDurationSeconds?: number;
    trackedRoutePath?: RoutePoint[];
    detectedZone?: string;
    isManual?: boolean;
  };
  costPerKm: number;
  recentZones: string[];
}

const APP_CHOICES: DeliveryAppName[] = ['iFood', 'Uber Eats', 'Rappi', 'Outro'];

export const DeliveryFormModal: React.FC<DeliveryFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  costPerKm,
  recentZones,
}) => {
  const editing = initialData?.editingRecord;

  const [app, setApp] = useState<DeliveryAppName>('iFood');
  const [baseValueStr, setBaseValueStr] = useState<string>('');
  const [tipValueStr, setTipValueStr] = useState<string>('0');
  const [distanceKmStr, setDistanceKmStr] = useState<string>('0');
  const [durationMinutesStr, setDurationMinutesStr] = useState<string>('15');
  const [zoneName, setZoneName] = useState<string>('Centro');
  const [notes, setNotes] = useState<string>('');
  const [periodOfDay, setPeriodOfDay] = useState<DayPeriod>(
    getDayPeriodFromDate(new Date())
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    if (editing) {
      setApp(editing.app);
      setBaseValueStr(String(editing.baseValue));
      setTipValueStr(String(editing.tipValue));
      setDistanceKmStr(String(editing.distanceKm));
      setDurationMinutesStr(
        String(Math.max(1, Math.round(editing.durationSeconds / 60)))
      );
      setZoneName(editing.zoneName || 'Centro');
      setNotes(editing.notes || '');
      setPeriodOfDay(editing.periodOfDay);
    } else {
      setApp('iFood');
      setBaseValueStr('');
      setTipValueStr('0');
      const dist = initialData?.trackedDistanceKm ?? 0;
      setDistanceKmStr(dist > 0 ? dist.toFixed(2) : '2.50');
      const durSec = initialData?.trackedDurationSeconds ?? 900;
      setDurationMinutesStr(String(Math.max(1, Math.round(durSec / 60))));
      setZoneName(initialData?.detectedZone || recentZones[0] || 'Centro');
      setNotes('');
      setPeriodOfDay(getDayPeriodFromDate(new Date()));
    }
  }, [isOpen, editing, initialData, recentZones]);

  if (!isOpen) return null;

  const parsedBase = Math.max(
    0,
    parseFloat(baseValueStr.replace(',', '.')) || 0
  );
  const parsedTip = Math.max(0, parseFloat(tipValueStr.replace(',', '.')) || 0);
  const parsedKm = Math.max(
    0,
    parseFloat(distanceKmStr.replace(',', '.')) || 0
  );
  const parsedMinutes = Math.max(
    1,
    parseFloat(durationMinutesStr.replace(',', '.')) || 1
  );

  const grossTotal = parsedBase + parsedTip;
  const bikeCost = parsedKm * costPerKm;
  const netProfit = grossTotal - bikeCost;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedBase <= 0 && parsedTip <= 0) {
      setErrorMsg('Informe o valor da entrega em R$.');
      return;
    }

    const durationSec =
      !editing &&
      initialData?.isManual === false &&
      initialData?.trackedDurationSeconds
        ? initialData.trackedDurationSeconds
        : Math.round(parsedMinutes * 60);

    const record: DeliveryRecord = {
      id: editing ? editing.id : `del-${Date.now()}`,
      date: editing ? editing.date : new Date().toISOString(),
      periodOfDay,
      app,
      baseValue: Number(parsedBase.toFixed(2)),
      tipValue: Number(parsedTip.toFixed(2)),
      distanceKm: Number(parsedKm.toFixed(2)),
      durationSeconds: durationSec,
      zoneName: zoneName.trim() || 'Região Local',
      notes: notes.trim(),
      isManual: editing ? editing.isManual : Boolean(initialData?.isManual),
      routePath: editing
        ? editing.routePath
        : initialData?.trackedRoutePath || [],
    };

    onSave(record);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 sm:hidden" />

        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bike className="w-5 h-5 text-emerald-500" />
              <span>
                {editing
                  ? 'Editar Entrega'
                  : initialData?.isManual
                  ? 'Nova Entrega Manual'
                  : 'Finalizar e Registrar Entrega'}
              </span>
            </h2>
            {!editing && !initialData?.isManual && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-0.5">
                Rastreado via GPS: {parsedKm.toFixed(2)} km em{' '}
                {formatDuration(initialData?.trackedDurationSeconds || 0)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Aplicativo Usado (Grandes botões para 1 toque) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Aplicativo Usado
            </label>
            <div className="grid grid-cols-4 gap-2">
              {APP_CHOICES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setApp(item)}
                  className={`min-h-[48px] px-2 py-2 rounded-xl border text-xs font-bold transition-colors whitespace-nowrap ${
                    app === item
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Valor da Entrega e Gorjeta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Valor da Entrega (R$) *
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-emerald-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="12,50"
                  value={baseValueStr}
                  onChange={(e) => setBaseValueStr(e.target.value)}
                  autoFocus
                  className="w-full min-h-[48px] pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-base font-mono tabular-nums font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              {/* Atalhos rápidos de valor para entregador */}
              <div className="flex items-center gap-1.5 mt-1.5">
                {[7, 10, 12, 15].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBaseValueStr(String(preset))}
                    className="flex-1 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 hover:bg-emerald-500/20 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300"
                  >
                    R${preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Gorjeta / Caixinha (R$)
              </label>
              <div className="relative">
                <Sparkles className="w-4 h-4 text-amber-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={tipValueStr}
                  onChange={(e) => setTipValueStr(e.target.value)}
                  className="w-full min-h-[48px] pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-base font-mono tabular-nums font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {[0, 2, 5, 10].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTipValueStr(String(preset))}
                    className="flex-1 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 hover:bg-amber-500/20 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300"
                  >
                    +R${preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Distância (km) e Tempo (min) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Distância Pedalada (km)
              </label>
              <div className="relative">
                <Navigation className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={distanceKmStr}
                  onChange={(e) => setDistanceKmStr(e.target.value)}
                  className="w-full min-h-[46px] pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Tempo Gasto (min)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="1"
                  inputMode="numeric"
                  value={durationMinutesStr}
                  onChange={(e) => setDurationMinutesStr(e.target.value)}
                  className="w-full min-h-[46px] pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Zona / Bairro e Período do Dia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Zona / Bairro da Entrega
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Ex: Pinheiros, Centro, Savassi..."
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="w-full min-h-[46px] pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                />
              </div>
              {recentZones.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {recentZones.slice(0, 4).map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoneName(z)}
                      className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 hover:text-emerald-400"
                    >
                      {z}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Turno / Horário
              </label>
              <select
                value={periodOfDay}
                onChange={(e) => setPeriodOfDay(e.target.value as DayPeriod)}
                className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              >
                {(Object.keys(DAY_PERIOD_LABELS) as DayPeriod[]).map((key) => (
                  <option key={key} value={key}>
                    {DAY_PERIOD_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Observações (Opcional)
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Ex: Condomínio com subida íngreme, cliente atencioso..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Resumo de Lucro Líquido Real (Bike) */}
          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">
                Bruto: {formatCurrency(grossTotal)}
              </span>
              <span className="text-slate-500 dark:text-slate-400 block mt-0.5">
                Desgaste Bike ({formatCurrency(costPerKm)}/km): -
                {formatCurrency(bikeCost)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] uppercase font-sans font-semibold text-slate-500 dark:text-slate-400 block">
                Lucro Líquido
              </span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(netProfit)}
              </span>
            </div>
          </div>

          {/* Botão Grande Salvar */}
          <div className="pt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[52px] px-5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 min-h-[52px] px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-transform"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Salvar Entrega</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
