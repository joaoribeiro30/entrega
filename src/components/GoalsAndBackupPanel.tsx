import React, { useRef, useState } from 'react';
import {
  Bell,
  Bike,
  Download,
  FileSpreadsheet,
  Target,
  Trash2,
  Upload,
  Volume2,
  Wrench,
} from 'lucide-react';
import { CourierSettings, DeliveryRecord } from '../types';
import {
  exportBackupToJSON,
  exportDeliveriesToCSV,
  formatCurrency,
  formatKm,
  parseImportedBackup,
  playGoalAchievedSound,
} from '../utils/geoAndSound';

interface GoalsAndBackupPanelProps {
  settings: CourierSettings;
  onUpdateSettings: (patch: Partial<CourierSettings>) => void;
  todayGross: number;
  todayNet: number;
  todayKm: number;
  deliveries: DeliveryRecord[];
  onImportBackup: (
    deliveries: DeliveryRecord[],
    settings?: Partial<CourierSettings>
  ) => void;
  onClearAllDeliveries: () => void;
}

export const GoalsAndBackupPanel: React.FC<GoalsAndBackupPanelProps> = ({
  settings,
  onUpdateSettings,
  todayGross,
  todayNet,
  todayKm,
  deliveries,
  onImportBackup,
  onClearAllDeliveries,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const earningsPct =
    settings.dailyEarningsGoal > 0
      ? Math.min(100, Math.round((todayGross / settings.dailyEarningsGoal) * 100))
      : 0;
  const kmPct =
    settings.dailyKmGoal > 0
      ? Math.min(100, Math.round((todayKm / settings.dailyKmGoal) * 100))
      : 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseImportedBackup(text);
      onImportBackup(result.deliveries, result.settings);
      setImportStatus({
        type: 'success',
        text: `Backup importado com sucesso (${result.deliveries.length} entregas).`,
      });
    } catch (err) {
      setImportStatus({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Erro ao ler o arquivo de backup.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Metas Diárias e Progresso em Tempo Real */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-500" />
              <span>Metas Diárias e Alertas</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Acompanhe o progresso do dia e receba aviso sonoro ao bater a meta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !settings.soundAlertsEnabled;
              onUpdateSettings({ soundAlertsEnabled: next });
              if (next) playGoalAchievedSound(true);
            }}
            className={`min-h-[42px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
              settings.soundAlertsEnabled
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-500'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>{settings.soundAlertsEnabled ? 'Som Ativo' : 'Mudo'}</span>
          </button>
        </div>

        {/* Barras de Progresso de Hoje */}
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Meta de Ganhos Hoje
              </span>
              <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(todayGross)} /{' '}
                {formatCurrency(settings.dailyEarningsGoal)} ({earningsPct}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${earningsPct}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Lucro Líquido de Hoje: {formatCurrency(todayNet)}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Meta de Quilometragem Hoje (Bike)
              </span>
              <span className="font-mono tabular-nums font-bold text-amber-500">
                {formatKm(todayKm)} / {formatKm(settings.dailyKmGoal)} ({kmPct}
                %)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${kmPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Inputs de Configuração de Metas e Custo Operacional Bike */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Meta Diária de Ganhos (R$)
            </label>
            <input
              type="number"
              step="10"
              min="10"
              value={settings.dailyEarningsGoal}
              onChange={(e) =>
                onUpdateSettings({
                  dailyEarningsGoal: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Meta Diária de Pedal (km)
            </label>
            <input
              type="number"
              step="5"
              min="1"
              value={settings.dailyKmGoal}
              onChange={(e) =>
                onUpdateSettings({
                  dailyKmGoal: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5 text-amber-500" />
              <span>Custo Bike por Km (R$/km)</span>
            </label>
            <input
              type="number"
              step="0.05"
              min="0"
              value={settings.costPerKm}
              onChange={(e) =>
                onUpdateSettings({
                  costPerKm: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white"
            />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Pneu, relação, freios e hidratação
            </span>
          </div>
        </div>
      </div>

      {/* Gestão de Dados: Exportar CSV / JSON e Importar Backup */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bike className="w-4 h-4 text-emerald-500" />
            <span>Gestão de Dados e Backup Local</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Seus dados são salvos automaticamente neste aparelho. Exporte
            planilhas ou faça backup completo com os trajetos GPS.
          </p>
        </div>

        {importStatus && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium ${
              importStatus.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-red-500/15 border-red-500/40 text-red-400'
            }`}
          >
            {importStatus.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => exportDeliveriesToCSV(deliveries, settings.costPerKm)}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => exportBackupToJSON(deliveries, settings)}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-500/15 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/15 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            <span>Importar Backup</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
        </div>

        {deliveries.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {deliveries.length} entregas armazenadas no dispositivo
            </span>
            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllDeliveries();
                    setConfirmClearAll(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                >
                  Confirmar Exclusão Total
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="text-xs text-red-400 hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Zerar Histórico</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
