import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  Bike,
  Clock,
  Compass,
  ExternalLink,
  LocateFixed,
  MapPin,
  Plus,
  Route as RouteIcon,
  Search,
  Trash2,
} from 'lucide-react';
import { ComputedMultiRoute, RouteStop } from '../types';
import {
  computeRealStreetBikeLeg,
  formatCurrency,
  formatDurationCompact,
  formatKm,
  openRouteInGoogleMapsApp,
} from '../utils/geoAndSound';

interface MultiStopRouteCalculatorProps {
  userLocation: { lat: number; lng: number };
  costPerKm: number;
  stops: RouteStop[];
  onChangeStops: (stops: RouteStop[]) => void;
  computedRoute: ComputedMultiRoute | null;
  onRouteComputed: (route: ComputedMultiRoute | null) => void;
  onFocusMap: () => void;
}

export const MultiStopRouteCalculator: React.FC<MultiStopRouteCalculatorProps> = ({
  userLocation,
  costPerKm,
  stops,
  onChangeStops,
  computedRoute,
  onRouteComputed,
  onFocusMap,
}) => {
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');

  const [searchQuery, setSearchQuery] = useState('');
  const [stopLabelInput, setStopLabelInput] = useState('');
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Initialize first stop with current GPS if list is empty
  useEffect(() => {
    if (stops.length === 0) {
      onChangeStops([
        {
          id: 'origin-gps',
          label: 'Ponto de Partida (Meu GPS)',
          address: `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`,
          lat: userLocation.lat,
          lng: userLocation.lng,
        },
      ]);
    }
  }, []);

  // Fetch autocomplete suggestions using modern AutocompleteSuggestion API
  useEffect(() => {
    if (!placesLib || !searchQuery.trim() || searchQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    setIsSearching(true);

    AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: searchQuery,
      sessionToken: sessionTokenRef.current,
      locationBias: {
        center: userLocation,
        radius: 15000,
      },
    })
      .then((res: any) => {
        if (!cancelled) {
          setSuggestions(res.suggestions || []);
        }
      })
      .catch((err: unknown) => {
        const msg = String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, searchQuery, userLocation]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        sessionTokenRef.current = null;
        setSuggestions([]);

        if (place.location) {
          const lat = place.location.lat();
          const lng = place.location.lng();
          const defaultLabel =
            stopLabelInput.trim() ||
            place.displayName ||
            `Parada ${stops.length}`;

          const newStop: RouteStop = {
            id: `stop-${Date.now()}`,
            label: defaultLabel,
            address:
              place.formattedAddress ||
              suggestion.placePrediction.text.text ||
              '',
            lat,
            lng,
          };
          onChangeStops([...stops, newStop]);
          setSearchQuery('');
          setStopLabelInput('');
        }
      } catch (err) {
        const msg = String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    },
    [placesLib, stopLabelInput, stops, onChangeStops]
  );

  const handleUseCurrentGpsAsOrigin = () => {
    const updatedOrigin: RouteStop = {
      id: 'origin-gps',
      label: 'Ponto de Partida (Meu GPS)',
      address: `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`,
      lat: userLocation.lat,
      lng: userLocation.lng,
    };
    if (stops.length === 0) {
      onChangeStops([updatedOrigin]);
    } else {
      onChangeStops([updatedOrigin, ...stops.slice(1)]);
    }
  };

  const handleRemoveStop = (id: string) => {
    onChangeStops(stops.filter((s) => s.id !== id));
    onRouteComputed(null);
  };

  const handleOpenMultiStopInGoogleMaps = () => {
    if (stops.length < 2) return;
    const originStop = stops[0];
    const destStop = stops[stops.length - 1];
    const middleStops = stops.slice(1, -1);
    openRouteInGoogleMapsApp({
      origin: { lat: originStop.lat, lng: originStop.lng },
      destination: { lat: destStop.lat, lng: destStop.lng },
      waypoints: middleStops.map((s) => ({ lat: s.lat, lng: s.lng })),
      travelMode: 'bicycling',
    });
  };

  const handleComputeMultiStopBikeRoute = async (redirectToGoogleMaps = false) => {
    if (stops.length < 2) {
      setRouteError(
        'Adicione pelo menos 2 paradas (Origem e 1 Entrega) para calcular.'
      );
      return;
    }
    setIsCalculating(true);
    setRouteError(null);

    try {
      const legsResult: ComputedMultiRoute['legs'] = [];
      const decodedPaths: Array<{ lat: number; lng: number }[]> = [];
      const encodedPolylines: string[] = [];
      let totalKm = 0;
      let totalSec = 0;

      // Calculate each consecutive leg using real street geometry (Routes SDK / DirectionsService / OSRM Bike)
      for (let i = 0; i < stops.length - 1; i++) {
        const fromStop = stops[i];
        const toStop = stops[i + 1];

        const legResult = await computeRealStreetBikeLeg({
          origin: { lat: fromStop.lat, lng: fromStop.lng },
          destination: { lat: toStop.lat, lng: toStop.lng },
          routesLib,
        });

        totalKm += legResult.distanceKm;
        totalSec += legResult.durationSeconds;

        legsResult.push({
          startAddress: fromStop.label,
          endAddress: toStop.label,
          distanceKm: legResult.distanceKm,
          durationSeconds: legResult.durationSeconds,
        });

        if (legResult.encodedPolyline) {
          encodedPolylines.push(legResult.encodedPolyline);
        }
        decodedPaths.push(legResult.decodedPath);
      }

      onRouteComputed({
        totalDistanceKm: Number(totalKm.toFixed(2)),
        totalDurationSeconds: totalSec,
        encodedPolylines,
        decodedPaths,
        legs: legsResult,
      });

      if (redirectToGoogleMaps) {
        handleOpenMultiStopInGoogleMaps();
      }
    } catch (err) {
      setRouteError(
        err instanceof Error
          ? err.message
          : 'Não foi possível calcular a rota de bicicleta.'
      );
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bike className="w-5 h-5 text-emerald-500" />
              <span>Calculadora de Rota Multi-Paradas (Bike)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Planeje coletas e múltiplas entregas otimizadas para bicicleta e
              ciclovias.
            </p>
          </div>
          <button
            type="button"
            onClick={handleUseCurrentGpsAsOrigin}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>Atualizar GPS</span>
          </button>
        </div>

        {/* Add Stop Input with Places Autocomplete */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Identificação (ex: Coleta, Cliente 1)"
              value={stopLabelInput}
              onChange={(e) => setStopLabelInput(e.target.value)}
              className="min-h-[46px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar endereço, restaurante ou rua..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[46px] pl-10 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Autocomplete Dropdown */}
          {suggestions.length > 0 && (
            <ul className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 shadow-xl overflow-hidden">
              {suggestions.map((sug, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => void handleSelectSuggestion(sug)}
                    className="w-full min-h-[46px] px-3.5 py-2.5 text-left hover:bg-emerald-500/10 flex items-center gap-2.5 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <Plus className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="truncate">
                      {sug.placePrediction?.text.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isSearching && (
            <p className="text-xs text-slate-400 px-1">
              Buscando endereços no Google Maps...
            </p>
          )}
        </div>

        {/* Stops List */}
        <div className="mt-4 space-y-2">
          {stops.map((stop, idx) => (
            <div
              key={stop.id}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {stop.label}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {stop.address}
                  </p>
                </div>
              </div>
              {stops.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveStop(stop.id)}
                  className="min-h-[38px] min-w-[38px] rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center shrink-0"
                  title="Remover parada"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {routeError && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-400">
            {routeError}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isCalculating || stops.length < 2}
            onClick={() => void handleComputeMultiStopBikeRoute(false)}
            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15"
          >
            <RouteIcon className="w-4 h-4" />
            <span>
              {isCalculating
                ? 'Traçando Ruas e Ciclovias...'
                : 'Calcular Rota no Mapa'}
            </span>
          </button>

          <button
            type="button"
            disabled={isCalculating || stops.length < 2}
            onClick={() => void handleComputeMultiStopBikeRoute(true)}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm flex items-center gap-1.5 shadow-lg"
            title="Calcular e abrir navegação diretamente no aplicativo do Google Maps"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Abrir no Google Maps</span>
          </button>

          {computedRoute && (
            <button
              type="button"
              onClick={onFocusMap}
              className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5"
            >
              <Compass className="w-4 h-4" />
              <span>Ver no Mapa</span>
            </button>
          )}
        </div>
      </div>

      {/* Route Result Summary */}
      {computedRoute && (
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Resumo do Roteiro Planejado
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Distância Total
              </span>
              <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5 block">
                {formatKm(computedRoute.totalDistanceKm)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Tempo Pedalando
              </span>
              <span className="text-sm font-bold font-mono tabular-nums text-emerald-500 mt-0.5 block">
                {formatDurationCompact(computedRoute.totalDurationSeconds)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Custo Bike Est.
              </span>
              <span className="text-sm font-bold font-mono tabular-nums text-amber-500 mt-0.5 block">
                {formatCurrency(computedRoute.totalDistanceKm * costPerKm)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            {computedRoute.legs.map((leg, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300 truncate">
                    {leg.startAddress} → {leg.endAddress}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                  {formatKm(leg.distanceKm)} ·{' '}
                  {formatDurationCompact(leg.durationSeconds)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
