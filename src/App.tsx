/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  BarChart3,
  Bike,
  CheckCircle2,
  CloudRain,
  Map as MapIcon,
  Moon,
  Navigation,
  Play,
  Plus,
  Route as RouteIcon,
  Square,
  Sun,
  Target,
  X,
} from 'lucide-react';
import {
  ComputedMultiRoute,
  CourierSettings,
  DeliveryFilterState,
  DeliveryRecord,
  MapLayersState,
  RestaurantFilterState,
  RoutePoint,
  RouteStop,
  WeatherData,
} from './types';
import {
  calculateDistanceKm,
  calculateTotalRouteDistanceKm,
  fetchLocalWeather,
  formatCurrency,
  formatDuration,
  formatKm,
  playFinishTrackingSound,
  playGoalAchievedSound,
  playStartTrackingSound,
  triggerGoalNotification,
} from './utils/geoAndSound';
import { InteractiveMap } from './components/InteractiveMap';
import { DeliveryFormModal } from './components/DeliveryFormModal';
import { MultiStopRouteCalculator } from './components/MultiStopRouteCalculator';
import { AnalyticsAndHistoryPanel } from './components/AnalyticsAndHistoryPanel';
import { GoalsAndBackupPanel } from './components/GoalsAndBackupPanel';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { useWakeLock } from './hooks/usePWAInstall';

const STORAGE_DELIVERIES_KEY = 'estacao_entregador_deliveries_v1';
const STORAGE_SETTINGS_KEY = 'estacao_entregador_settings_v1';
const STORAGE_LAYERS_KEY = 'estacao_entregador_layers_v1';
const STORAGE_GOAL_ALERT_DATE_KEY = 'estacao_entregador_goal_alert_v1';

// Default center (São Paulo Praça da Sé) until user's real GPS fix arrives
const DEFAULT_COORDS = { lat: -23.5505, lng: -46.6333 };

const DEFAULT_SETTINGS: CourierSettings = {
  dailyEarningsGoal: 150,
  dailyKmGoal: 45,
  costPerKm: 0.35, // Custo operacional médio de bike (relação, pneu, freio, hidratação)
  theme: 'dark',
  soundAlertsEnabled: true,
};

const DEFAULT_LAYERS: MapLayersState = {
  restaurantHeatmap: true,
  personalHeatmap: true,
  myPoints: true,
  traffic: false,
  bikeLanes: true,
  weatherOverlay: true,
};

type ActiveTab = 'map' | 'analytics' | 'routes' | 'goals';

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Quota warning state (Google Maps Platform Section 8 Case A)
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () =>
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Deliveries persisted in localStorage (starts empty as confirmed by user)
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_DELIVERIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });

  // Settings persisted in localStorage
  const [settings, setSettings] = useState<CourierSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_SETTINGS;
  });

  // Map layers persisted in localStorage
  const [layers, setLayers] = useState<MapLayersState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LAYERS_KEY);
      if (saved) {
        return { ...DEFAULT_LAYERS, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_LAYERS;
  });

  // Sync theme with <html class="dark">
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Persist changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DELIVERIES_KEY, JSON.stringify(deliveries));
    } catch {
      // Ignore quota errors
    }
  }, [deliveries]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LAYERS_KEY, JSON.stringify(layers));
    } catch {
      // Ignore
    }
  }, [layers]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');

  // Real Geolocation State
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  }>(DEFAULT_COORDS);
  const [hasRealGpsFix, setHasRealGpsFix] = useState(false);
  const [detectedZone, setDetectedZone] = useState<string>('Centro');

  // Active Delivery Tracking State ("Entrega em Andamento")
  const [isTracking, setIsTracking] = useState(false);
  const [trackingStartTime, setTrackingStartTime] = useState<number | null>(
    null
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveRoutePath, setLiveRoutePath] = useState<RoutePoint[]>([]);
  const watchIdRef = useRef<number | null>(null);

  // Keep Redmi Note 12 / Android screen awake on bike handlebar while tracking
  useWakeLock(isTracking);

  // Replay State
  const [replayDelivery, setReplayDelivery] = useState<DeliveryRecord | null>(
    null
  );

  // Multi-stop route calculator state
  const [plannedStops, setPlannedStops] = useState<RouteStop[]>([]);
  const [plannedRoute, setPlannedRoute] = useState<ComputedMultiRoute | null>(
    null
  );

  // Weather State
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Filters State
  const [restaurantFilters, setRestaurantFilters] =
    useState<RestaurantFilterState>({
      minRating: 0,
      openNow: false,
      cuisineType: 'all',
    });

  const [deliveryFilters, setDeliveryFilters] = useState<DeliveryFilterState>({
    periodRange: 'all',
    app: 'all',
    minValue: 0,
    dayPeriod: 'all',
  });

  // Delivery Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<{
    editingRecord?: DeliveryRecord | null;
    trackedDistanceKm?: number;
    trackedDurationSeconds?: number;
    trackedRoutePath?: RoutePoint[];
    detectedZone?: string;
    isManual?: boolean;
  }>({});

  // Goal Achievement Banner State
  const [goalBannerMessage, setGoalBannerMessage] = useState<string | null>(
    null
  );

  // Request initial GPS position on mount
  const refreshGpsFix = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setHasRealGpsFix(true);
      },
      () => {
        // Keep last or default position if user denies permission
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }, []);

  useEffect(() => {
    refreshGpsFix();
  }, [refreshGpsFix]);

  // Fetch local weather when userLocation updates
  useEffect(() => {
    let cancelled = false;
    fetchLocalWeather(userLocation.lat, userLocation.lng)
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch(() => {
        // Ignore offline weather errors
      });
    return () => {
      cancelled = true;
    };
  }, [userLocation.lat.toFixed(2), userLocation.lng.toFixed(2)]);

  // Live timer during active delivery
  useEffect(() => {
    if (!isTracking || !trackingStartTime) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - trackingStartTime) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isTracking, trackingStartTime]);

  // Real-time Geolocation watchPosition when tracking is active
  useEffect(() => {
    if (!isTracking) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy ?? 15;

          setUserLocation({ lat: newLat, lng: newLng });
          setHasRealGpsFix(true);

          // Ignore noisy jumps with accuracy worse than 60m
          if (accuracy > 60) return;

          setLiveRoutePath((prev) => {
            if (prev.length === 0) {
              return [
                {
                  lat: newLat,
                  lng: newLng,
                  timestamp: Date.now(),
                  speed: pos.coords.speed,
                },
              ];
            }
            const last = prev[prev.length - 1];
            const distKm = calculateDistanceKm(
              last.lat,
              last.lng,
              newLat,
              newLng
            );
            // Minimum 5 meters movement threshold to avoid stationary GPS drift
            if (distKm < 0.005) return prev;
            return [
              ...prev,
              {
                lat: newLat,
                lng: newLng,
                timestamp: Date.now(),
                speed: pos.coords.speed,
              },
            ];
          });
        },
        () => {
          // Ignore transient GPS signal loss
        },
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 10000,
        }
      );
    }

    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isTracking]);

  const liveDistanceKm = useMemo(
    () => calculateTotalRouteDistanceKm(liveRoutePath),
    [liveRoutePath]
  );

  // Start Delivery Tracking (1 tap)
  const handleStartDelivery = () => {
    setReplayDelivery(null);
    const now = Date.now();
    setTrackingStartTime(now);
    setElapsedSeconds(0);
    setLiveRoutePath([
      {
        lat: userLocation.lat,
        lng: userLocation.lng,
        timestamp: now,
        speed: 0,
      },
    ]);
    setIsTracking(true);
    playStartTrackingSound(settings.soundAlertsEnabled);
  };

  // Finish Delivery Tracking (1 tap -> opens quick form with tracked data)
  const handleFinishDelivery = () => {
    const finalDuration = Math.max(1, elapsedSeconds);
    const finalPath =
      liveRoutePath.length >= 2
        ? liveRoutePath
        : [
            ...liveRoutePath,
            {
              lat: userLocation.lat,
              lng: userLocation.lng,
              timestamp: Date.now(),
            },
          ];
    const finalDist = calculateTotalRouteDistanceKm(finalPath);

    setIsTracking(false);
    setTrackingStartTime(null);
    playFinishTrackingSound(settings.soundAlertsEnabled);

    setModalInitialData({
      editingRecord: null,
      trackedDistanceKm: finalDist,
      trackedDurationSeconds: finalDuration,
      trackedRoutePath: finalPath,
      detectedZone,
      isManual: false,
    });
    setModalOpen(true);
    setLiveRoutePath([]);
  };

  // Calculate Today's metrics for Goal Progress & Alerts
  const todayStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    let gross = 0;
    let km = 0;
    let count = 0;

    deliveries.forEach((d) => {
      if (new Date(d.date).getTime() >= startOfToday) {
        gross += d.baseValue + d.tipValue;
        km += d.distanceKm;
        count += 1;
      }
    });

    const cost = km * settings.costPerKm;
    const net = gross - cost;

    return { gross, net, km, count };
  }, [deliveries, settings.costPerKm]);

  // Check if daily earnings or daily km goal was newly reached today
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    let storedAlertState: { date?: string; earnings?: boolean; km?: boolean } =
      {};
    try {
      const raw = localStorage.getItem(STORAGE_GOAL_ALERT_DATE_KEY);
      if (raw) storedAlertState = JSON.parse(raw);
    } catch {
      // Ignore
    }
    if (storedAlertState.date !== todayKey) {
      storedAlertState = { date: todayKey, earnings: false, km: false };
    }

    let updated = false;
    if (
      settings.dailyEarningsGoal > 0 &&
      todayStats.gross >= settings.dailyEarningsGoal &&
      !storedAlertState.earnings
    ) {
      storedAlertState.earnings = true;
      updated = true;
      const msg = `Meta diária de ganhos atingida! Você acumulou ${formatCurrency(
        todayStats.gross
      )} hoje (${formatCurrency(todayStats.net)} líquidos).`;
      setGoalBannerMessage(msg);
      playGoalAchievedSound(settings.soundAlertsEnabled);
      triggerGoalNotification('Meta de Ganhos Atingida!', msg);
    } else if (
      settings.dailyKmGoal > 0 &&
      todayStats.km >= settings.dailyKmGoal &&
      !storedAlertState.km
    ) {
      storedAlertState.km = true;
      updated = true;
      const msg = `Meta diária de pedal atingida! Você completou ${formatKm(
        todayStats.km
      )} hoje.`;
      setGoalBannerMessage(msg);
      playGoalAchievedSound(settings.soundAlertsEnabled);
      triggerGoalNotification('Meta de Quilometragem Atingida!', msg);
    }

    if (updated) {
      try {
        localStorage.setItem(
          STORAGE_GOAL_ALERT_DATE_KEY,
          JSON.stringify(storedAlertState)
        );
      } catch {
        // Ignore
      }
    }
  }, [
    todayStats.gross,
    todayStats.km,
    settings.dailyEarningsGoal,
    settings.dailyKmGoal,
    settings.soundAlertsEnabled,
  ]);

  const recentZones = useMemo(() => {
    const set = new Set<string>();
    deliveries.forEach((d) => {
      if (d.zoneName) set.add(d.zoneName);
    });
    if (detectedZone) set.add(detectedZone);
    return Array.from(set);
  }, [deliveries, detectedZone]);

  const handleSaveDelivery = (record: DeliveryRecord) => {
    setDeliveries((prev) => {
      const exists = prev.some((x) => x.id === record.id);
      if (exists) {
        return prev.map((x) => (x.id === record.id ? record : x));
      }
      return [record, ...prev];
    });
  };

  const handleDeleteDelivery = (id: string) => {
    setDeliveries((prev) => prev.filter((x) => x.id !== id));
    if (replayDelivery?.id === id) {
      setReplayDelivery(null);
    }
  };

  const handleOpenManualModal = () => {
    setModalInitialData({
      editingRecord: null,
      trackedDistanceKm: 2.5,
      trackedDurationSeconds: 900,
      trackedRoutePath: [
        {
          lat: userLocation.lat,
          lng: userLocation.lng,
          timestamp: Date.now() - 900000,
        },
        {
          lat: userLocation.lat + 0.008,
          lng: userLocation.lng + 0.008,
          timestamp: Date.now(),
        },
      ],
      detectedZone,
      isManual: true,
    });
    setModalOpen(true);
  };

  const handleEditDelivery = (record: DeliveryRecord) => {
    setModalInitialData({
      editingRecord: record,
      isManual: record.isManual,
    });
    setModalOpen(true);
  };

  const handleReplayDelivery = (record: DeliveryRecord) => {
    setReplayDelivery(record);
    setActiveTab('map');
  };

  const handleToggleLayer = (key: keyof MapLayersState) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const earningsGoalPercent =
    settings.dailyEarningsGoal > 0
      ? Math.min(
          100,
          Math.round((todayStats.gross / settings.dailyEarningsGoal) * 100)
        )
      : 0;

  const kmGoalPercent =
    settings.dailyKmGoal > 0
      ? Math.min(100, Math.round((todayStats.km / settings.dailyKmGoal) * 100))
      : 0;

  return (
    <APIProvider
      apiKey={apiKey}
      language="pt-BR"
      region="BR"
      libraries={['places', 'routes']}
    >
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Mandatory Google Maps Platform Quota Banner (When Triggered) */}
        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner,
              visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* Top Bar Contract: 3 Zones separated by gap-8 */}
        <header className="flex items-center justify-between gap-8 px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('map');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            Estação do Entregador
          </a>

          {/* Zone 2: 4 clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`hover:text-emerald-500 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'map'
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Mapa Ao Vivo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`hover:text-emerald-500 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'analytics'
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Desempenho
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('routes')}
              className={`hover:text-emerald-500 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'routes'
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Roteiro Bike
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className={`hover:text-emerald-500 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'goals'
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold underline underline-offset-8'
                  : ''
              }`}
            >
              Metas e Dados
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleOpenManualModal}
              className="min-h-[42px] px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Entrega Manual</span>
            </button>
          </div>
        </header>

        {/* Sub-Header Telemetry & Daily Goal Progress Strip */}
        <div className="px-4 sm:px-6 py-2 bg-slate-100 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {/* Earnings Goal Bar */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Hoje Líq:
              </span>
              <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(todayStats.net)}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                Bruto {formatCurrency(todayStats.gross)} /{' '}
                {formatCurrency(settings.dailyEarningsGoal)}
              </span>
              <div className="w-16 sm:w-24 h-2 rounded-full bg-slate-300 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${earningsGoalPercent}%` }}
                />
              </div>
            </div>

            {/* Bike KM Goal Bar */}
            <div className="hidden sm:flex items-center gap-2">
              <Bike className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {formatKm(todayStats.km)} / {formatKm(settings.dailyKmGoal)}
              </span>
              <div className="w-20 h-2 rounded-full bg-slate-300 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${kmGoalPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right Utilities: Weather Summary, PWA Install & Theme Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            {weather && (
              <div className="hidden sm:flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                <span>{weather.temperatureC}°C</span>
                <span>·</span>
                <span className="font-sans">{weather.conditionLabel}</span>
              </div>
            )}

            <PWAInstallButton />

            <button
              type="button"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  theme: s.theme === 'dark' ? 'light' : 'dark',
                }))
              }
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 text-xs font-medium"
              title="Alternar Modo Escuro / Claro"
            >
              {settings.theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Modo Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-700" />
                  <span>Modo Escuro</span>
                </>
              )}
            </button>
          </div>
        </div>

        <OfflineIndicator />

        {/* Visual Alert Toast when Daily Goal is Achieved */}
        {goalBannerMessage && (
          <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-emerald-500 text-slate-950 shadow-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{goalBannerMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setGoalBannerMessage(null)}
              className="p-1 rounded-lg hover:bg-emerald-600/30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Responsive Workstation Content */}
        <main className="flex-1 max-w-[1440px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 p-3 sm:p-4 pb-36 lg:pb-28">
          {/* Left Column (7 cols on Desktop): Interactive Map */}
          <div
            className={`lg:col-span-7 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-lg h-[56vh] lg:h-[calc(100vh-190px)] min-h-[380px] ${
              activeTab === 'map' ? 'block' : 'hidden lg:block'
            }`}
          >
            <InteractiveMap
              userLocation={userLocation}
              hasRealGpsFix={hasRealGpsFix}
              isTracking={isTracking}
              liveRoutePath={liveRoutePath}
              deliveries={deliveries}
              layers={layers}
              onToggleLayer={handleToggleLayer}
              restaurantFilters={restaurantFilters}
              onUpdateRestaurantFilters={(patch) =>
                setRestaurantFilters((prev) => ({ ...prev, ...patch }))
              }
              replayDelivery={replayDelivery}
              onCloseReplay={() => setReplayDelivery(null)}
              plannedRoute={plannedRoute}
              plannedStops={plannedStops}
              onApplyClusterRoute={(route, stops) => {
                setPlannedRoute(route);
                setPlannedStops(stops);
              }}
              onClearPlannedRoute={() => setPlannedRoute(null)}
              weather={weather}
              costPerKm={settings.costPerKm}
              soundAlertsEnabled={settings.soundAlertsEnabled}
              onRecenterGps={refreshGpsFix}
              onDetectZoneName={setDetectedZone}
            />
          </div>

          {/* Right Column (5 cols on Desktop): Active Workstation Panel */}
          <div
            className={`lg:col-span-5 lg:h-[calc(100vh-190px)] lg:overflow-y-auto lg:pr-1 ${
              activeTab === 'map' ? 'block' : 'block'
            }`}
          >
            {/* Desktop Panel Switcher Header */}
            <div className="hidden lg:grid grid-cols-3 gap-1.5 p-1 mb-4 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() =>
                  setActiveTab(activeTab === 'map' ? 'analytics' : 'analytics')
                }
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'analytics' || activeTab === 'map'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Estatísticas & Histórico
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('routes')}
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'routes'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Rota Multi-Paradas
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('goals')}
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'goals'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Metas & Backup
              </button>
            </div>

            {activeTab === 'routes' ? (
              <MultiStopRouteCalculator
                userLocation={userLocation}
                costPerKm={settings.costPerKm}
                stops={plannedStops}
                onChangeStops={setPlannedStops}
                computedRoute={plannedRoute}
                onRouteComputed={setPlannedRoute}
                onFocusMap={() => setActiveTab('map')}
              />
            ) : activeTab === 'goals' ? (
              <GoalsAndBackupPanel
                settings={settings}
                onUpdateSettings={(patch) =>
                  setSettings((prev) => ({ ...prev, ...patch }))
                }
                todayGross={todayStats.gross}
                todayNet={todayStats.net}
                todayKm={todayStats.km}
                deliveries={deliveries}
                onImportBackup={(importedDeliveries, importedSettings) => {
                  setDeliveries(importedDeliveries);
                  if (importedSettings) {
                    setSettings((prev) => ({ ...prev, ...importedSettings }));
                  }
                }}
                onClearAllDeliveries={() => setDeliveries([])}
              />
            ) : (
              <AnalyticsAndHistoryPanel
                deliveries={deliveries}
                costPerKm={settings.costPerKm}
                filters={deliveryFilters}
                onUpdateFilters={(patch) =>
                  setDeliveryFilters((prev) => ({ ...prev, ...patch }))
                }
                onAddManualDelivery={handleOpenManualModal}
                onEditDelivery={handleEditDelivery}
                onDeleteDelivery={handleDeleteDelivery}
                onReplayDelivery={handleReplayDelivery}
              />
            )}
          </div>
        </main>

        {/* Thumb-Zone Bottom Dock: Primary 1-Tap Delivery Action + Mobile Navigation */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 pt-2.5 pb-2 shadow-2xl">
          <div className="max-w-[1440px] mx-auto flex flex-col gap-2">
            {/* Modo "Entrega em Andamento" Primary Action Bar */}
            {!isTracking ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartDelivery}
                  className="flex-1 min-h-[52px] px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-display font-bold text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/20 transition-transform"
                >
                  <Play className="w-5 h-5 fill-slate-950" />
                  <span>Iniciar Entrega (Rastrear GPS)</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 p-2 rounded-2xl bg-slate-900 dark:bg-slate-950 border border-amber-500/70 text-white">
                <div className="flex items-center gap-3 pl-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Navigation className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-400">
                      Entrega em Andamento
                    </div>
                    <div className="text-sm sm:text-base font-mono tabular-nums font-bold flex items-center gap-2">
                      <span>{formatDuration(elapsedSeconds)}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-emerald-400">
                        {formatKm(liveDistanceKm)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFinishDelivery}
                  className="min-h-[48px] px-5 rounded-xl bg-red-500 hover:bg-red-400 active:scale-[0.98] text-white font-display font-bold text-sm sm:text-base flex items-center gap-2 shadow-lg shadow-red-500/25 transition-transform whitespace-nowrap shrink-0"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Finalizar Entrega</span>
                </button>
              </div>
            )}

            {/* Mobile 4-Tab Thumb Bar */}
            <div className="grid grid-cols-4 gap-1 lg:hidden pt-0.5">
              {[
                { id: 'map' as const, label: 'Mapa', icon: MapIcon },
                {
                  id: 'analytics' as const,
                  label: 'Desempenho',
                  icon: BarChart3,
                },
                { id: 'routes' as const, label: 'Rota Bike', icon: RouteIcon },
                { id: 'goals' as const, label: 'Metas', icon: Target },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`min-h-[44px] py-1 rounded-xl flex flex-col items-center justify-center transition-colors ${
                      active
                        ? 'text-emerald-500 font-bold bg-emerald-500/10'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] mt-0.5 whitespace-nowrap">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fast Mobile Delivery Logging & Editing Modal */}
        <DeliveryFormModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveDelivery}
          initialData={modalInitialData}
          costPerKm={settings.costPerKm}
          recentZones={recentZones}
        />
      </div>
    </APIProvider>
  );
}
