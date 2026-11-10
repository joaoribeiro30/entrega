import React, { useState } from 'react';
import {
  BatteryCharging,
  Check,
  CheckCircle2,
  Copy,
  Download,
  MapPin,
  Smartphone,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

const PWA_MANIFEST_JSON_TEXT = JSON.stringify(
  {
    id: '/',
    name: 'Estação do Entregador',
    short_name: 'Entregador',
    description:
      'Estação de trabalho mobile-first para entregadores ciclistas com mapa de demanda, rastreamento GPS em tempo real, rotas de bike e controle financeiro.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0F17',
    theme_color: '#0B0F17',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['navigation', 'productivity', 'finance', 'utilities'],
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  null,
  2
);

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-xl">
      <span className="h-2.5 w-2.5 rounded-full bg-slate-950 animate-pulse" />
      <span>Modo Offline — Seus registros e histórico local estão salvos.</span>
    </div>
  );
};

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const handleCopyManifest = async () => {
    try {
      await navigator.clipboard.writeText(PWA_MANIFEST_JSON_TEXT);
      setCopiedManifest(true);
      window.setTimeout(() => setCopiedManifest(false), 3000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <>
      {!isInstalled && (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
          title="Instalar aplicativo no Redmi Note 12 / Android"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{isInstallable ? 'Instalar App' : 'Instalar no Celular'}</span>
        </button>
      )}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-500 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Instalar no Redmi Note 12 (MIUI / HyperOS)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Instale direto pelo Chrome sem precisar do PWABuilder
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInstallable && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-3">
                <div className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">
                  Seu navegador já liberou a instalação direta com 1 toque:
                </div>
                <button
                  type="button"
                  onClick={() => void install()}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Instalar Agora</span>
                </button>
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="p-3.5 rounded-2xl bg-emerald-950/20 dark:bg-emerald-950/40 border border-emerald-500/40 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    Método 1 (Recomendado): Direto no Chrome do Redmi Note 12
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Você <strong>não precisa usar o PWABuilder</strong>. O link de
                  preview do AI Studio tem proteção de login que bloqueia robôs
                  externos como o PWABuilder, mas funciona direto no seu celular:
                </p>
                {isIOS ? (
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300">
                    <li>
                      Toque no botão <strong>Compartilhar</strong> na barra do
                      Safari.
                    </li>
                    <li>
                      Role para baixo e toque em{' '}
                      <strong>Adicionar à Tela de Início</strong>.
                    </li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300">
                    <li>
                      Envie o link do app pelo WhatsApp para você mesmo e abra no{' '}
                      <strong>Google Chrome</strong> do seu Redmi Note 12.
                    </li>
                    <li>
                      Toque no botão verde <strong>"Instalar App"</strong> no
                      topo do app (ou nos <strong>3 pontinhos ⋮</strong> do
                      Chrome &gt; <strong>"Instalar aplicativo"</strong>).
                    </li>
                    <li>
                      Na MIUI/HyperOS, libere{' '}
                      <strong>"Atalhos da tela inicial"</strong> em{' '}
                      <em>Configurações &gt; Apps &gt; Chrome &gt; Permissões</em>.
                    </li>
                  </ol>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Como desbloquear o botão no PWABuilder</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyManifest()}
                    className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-500 dark:text-blue-300 text-[11px] font-bold flex items-center gap-1"
                  >
                    {copiedManifest ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>JSON Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Manifest</span>
                      </>
                    )}
                  </button>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    Para o PWABuilder conseguir ler o site sozinho, primeiro
                    clique em <strong>Deploy (Publicar no Cloud Run)</strong> no
                    canto superior direito do AI Studio e use a URL pública do
                    Cloud Run (<code>.run.app</code> público).
                  </li>
                  <li>
                    <strong>Ou na tela atual do PWABuilder:</strong> clique no
                    botão <strong>"Edit Your Manifest"</strong> (logo abaixo de
                    Action Items), clique na aba <strong>Code</strong> e cole o
                    JSON copiado no botão acima. Isso libera o botão{' '}
                    <strong>Package For Stores</strong> na hora!
                  </li>
                </ol>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BatteryCharging className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    Configurar Bateria da MIUI/HyperOS (Não cortar o GPS)
                  </span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
                  <li>
                    Segure o dedo no ícone do app instalado &gt;{' '}
                    <strong>Informações do App</strong> &gt;{' '}
                    <strong>Economia de bateria</strong> &gt; selecione{' '}
                    <strong>"Nenhuma restrição"</strong>.
                  </li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[46px] rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition-colors"
            >
              Entendi, Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
};
