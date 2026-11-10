import {
  AiHotspotRouteAnalysis,
  CourierSettings,
  DayPeriod,
  DeliveryRecord,
  RestaurantClusterSuggestion,
  RestaurantPoint,
  RoutePoint,
  WeatherData,
} from '../types';

export const DAY_PERIOD_LABELS: Record<DayPeriod, string> = {
  manha: 'Manhã (06h–11h)',
  almoco: 'Almoço (11h–15h)',
  tarde: 'Tarde (15h–18h)',
  jantar: 'Jantar (18h–23h)',
  madrugada: 'Madrugada (23h–06h)',
};

export function getDayPeriodFromDate(dateInput: Date | string): DayPeriod {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const hour = d.getHours();
  if (hour >= 6 && hour < 11) return 'manha';
  if (hour >= 11 && hour < 15) return 'almoco';
  if (hour >= 15 && hour < 18) return 'tarde';
  if (hour >= 18 && hour < 23) return 'jantar';
  return 'madrugada';
}

/**
 * Haversine distance in kilometers between two GPS points
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateTotalRouteDistanceKm(points: RoutePoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistanceKm(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );
  }
  return Number(total.toFixed(3));
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatKm(km: number): string {
  return `${km.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} km`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(
      2,
      '0'
    )}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationCompact(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins} min`;
}

/**
 * Web Audio API sound alerts (zero external file dependency)
 */
export function playToneSequence(
  frequencies: number[],
  durationMs = 140
): void {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(
        freq,
        ctx.currentTime + (index * durationMs) / 1000
      );
      gain.gain.setValueAtTime(
        0.18,
        ctx.currentTime + (index * durationMs) / 1000
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + ((index + 1) * durationMs) / 1000
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + (index * durationMs) / 1000);
      osc.stop(ctx.currentTime + ((index + 1) * durationMs) / 1000);
    });
  } catch {
    // Ignore audio context blocks if no user gesture yet
  }
}

export function playStartTrackingSound(enabled = true): void {
  if (!enabled) return;
  playToneSequence([440, 587.33], 110);
}

export function playFinishTrackingSound(enabled = true): void {
  if (!enabled) return;
  playToneSequence([587.33, 440], 120);
}

export function playGoalAchievedSound(enabled = true): void {
  if (!enabled) return;
  playToneSequence([523.25, 659.25, 783.99, 1046.5], 150);
}

export function playHotspotAlertSound(enabled = true): void {
  if (!enabled) return;
  playToneSequence([659.25, 880, 987.77], 115);
}

export function triggerGoalNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        new Notification(title, { body });
      }
    });
  }
}

/**
 * Spatial clustering algorithm to detect when the courier is in/near a high-demand point
 * and identify the most efficient nearby restaurant cluster to navigate to.
 */
export function identifyBestRestaurantCluster(
  restaurants: RestaurantPoint[],
  userLocation: { lat: number; lng: number }
): Omit<RestaurantClusterSuggestion, 'suggestedRoute'> | null {
  if (!restaurants || restaurants.length === 0) return null;

  const CLUSTER_RADIUS_KM = 0.55; // 550m grouping radius for a commercial restaurant hub

  const candidates = restaurants.map((anchor) => {
    const members = restaurants.filter(
      (other) =>
        calculateDistanceKm(anchor.lat, anchor.lng, other.lat, other.lng) <=
        CLUSTER_RADIUS_KM
    );

    const totalWeight = members.reduce((acc, m) => acc + m.weight, 0);
    const avgLat =
      members.reduce((acc, m) => acc + m.lat * m.weight, 0) / totalWeight;
    const avgLng =
      members.reduce((acc, m) => acc + m.lng * m.weight, 0) / totalWeight;
    const avgRating =
      members.reduce((acc, m) => acc + m.rating, 0) / members.length;

    const distFromUser = calculateDistanceKm(
      userLocation.lat,
      userLocation.lng,
      avgLat,
      avgLng
    );

    // Efficiency score balances cluster density/demand against cycling distance
    const efficiencyScore =
      (totalWeight * (1 + members.length * 0.35)) /
      Math.max(0.2, distFromUser + 0.15);

    const addressParts = anchor.address.split('-');
    const zoneHint =
      addressParts.length >= 2
        ? addressParts[1].split(',')[0].trim()
        : anchor.cuisineLabel;

    return {
      id: `cluster-${anchor.id}-${members.length}`,
      clusterName:
        zoneHint && zoneHint.length > 2
          ? `Polo ${zoneHint}`
          : `Cluster ${anchor.name}`,
      anchorRestaurantName: anchor.name,
      center: { lat: Number(avgLat.toFixed(6)), lng: Number(avgLng.toFixed(6)) },
      restaurantCount: members.length,
      avgRating: Number(avgRating.toFixed(1)),
      totalDemandScore: Number(totalWeight.toFixed(1)),
      distanceFromCourierKm: Number(distFromUser.toFixed(2)),
      isCourierInsideHotspot: distFromUser <= 1.5 || totalWeight >= 6,
      topRestaurants: members
        .slice(0, 3)
        .map((m) => m.name),
      efficiencyScore,
    };
  });

  // Sort by highest efficiency (high restaurant concentration + closest to courier)
  candidates.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  const best = candidates[0];
  if (!best) return null;

  return {
    id: best.id,
    clusterName: best.clusterName,
    anchorRestaurantName: best.anchorRestaurantName,
    center: best.center,
    restaurantCount: best.restaurantCount,
    avgRating: best.avgRating,
    totalDemandScore: best.totalDemandScore,
    distanceFromCourierKm: best.distanceFromCourierKm,
    isCourierInsideHotspot: best.isCourierInsideHotspot,
    topRestaurants: best.topRestaurants,
  };
}

/**
 * Returns up to top N distinct high-demand restaurant clusters for AI route comparison
 */
export function identifyTopRestaurantClusters(
  restaurants: RestaurantPoint[],
  userLocation: { lat: number; lng: number },
  maxClusters = 3
): Array<Omit<RestaurantClusterSuggestion, 'suggestedRoute'>> {
  if (!restaurants || restaurants.length === 0) return [];

  const CLUSTER_RADIUS_KM = 0.55;
  const allCandidates = restaurants.map((anchor) => {
    const members = restaurants.filter(
      (other) =>
        calculateDistanceKm(anchor.lat, anchor.lng, other.lat, other.lng) <=
        CLUSTER_RADIUS_KM
    );
    const totalWeight = members.reduce((acc, m) => acc + m.weight, 0);
    const avgLat =
      members.reduce((acc, m) => acc + m.lat * m.weight, 0) / totalWeight;
    const avgLng =
      members.reduce((acc, m) => acc + m.lng * m.weight, 0) / totalWeight;
    const avgRating =
      members.reduce((acc, m) => acc + m.rating, 0) / members.length;
    const distFromUser = calculateDistanceKm(
      userLocation.lat,
      userLocation.lng,
      avgLat,
      avgLng
    );
    const efficiencyScore =
      (totalWeight * (1 + members.length * 0.35)) /
      Math.max(0.2, distFromUser + 0.15);

    const addressParts = anchor.address.split('-');
    const zoneHint =
      addressParts.length >= 2
        ? addressParts[1].split(',')[0].trim()
        : anchor.cuisineLabel;

    return {
      id: `cluster-${anchor.id}-${members.length}`,
      clusterName:
        zoneHint && zoneHint.length > 2
          ? `Polo ${zoneHint}`
          : `Cluster ${anchor.name}`,
      anchorRestaurantName: anchor.name,
      center: { lat: Number(avgLat.toFixed(6)), lng: Number(avgLng.toFixed(6)) },
      restaurantCount: members.length,
      avgRating: Number(avgRating.toFixed(1)),
      totalDemandScore: Number(totalWeight.toFixed(1)),
      distanceFromCourierKm: Number(distFromUser.toFixed(2)),
      isCourierInsideHotspot: distFromUser <= 1.5 || totalWeight >= 6,
      topRestaurants: members.slice(0, 3).map((m) => m.name),
      efficiencyScore,
    };
  });

  allCandidates.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  const distinct: Array<Omit<RestaurantClusterSuggestion, 'suggestedRoute'>> =
    [];
  for (const cand of allCandidates) {
    const tooClose = distinct.some(
      (d) =>
        calculateDistanceKm(
          d.center.lat,
          d.center.lng,
          cand.center.lat,
          cand.center.lng
        ) < 0.45
    );
    if (!tooClose) {
      distinct.push({
        id: cand.id,
        clusterName: cand.clusterName,
        anchorRestaurantName: cand.anchorRestaurantName,
        center: cand.center,
        restaurantCount: cand.restaurantCount,
        avgRating: cand.avgRating,
        totalDemandScore: cand.totalDemandScore,
        distanceFromCourierKm: cand.distanceFromCourierKm,
        isCourierInsideHotspot: cand.isCourierInsideHotspot,
        topRestaurants: cand.topRestaurants,
      });
    }
    if (distinct.length >= maxClusters) break;
  }

  return distinct;
}

/**
 * Calls server-side Gemini endpoint (/api/ai/analyze-hotspot-route) with anonymized
 * cluster & route telemetry to analyze the best route to a high-heatmap zone.
 */
export async function requestAiHotspotRouteAnalysis(params: {
  candidates: Array<{
    clusterId: string;
    zoneLabel: string;
    restaurantCount: number;
    heatmapDemandScore: number;
    routeDistanceKm: number;
    routeDurationMinutes: number;
    estimatedBikeCostBrl: number;
  }>;
  weather: WeatherData | null;
  costPerKm: number;
}): Promise<AiHotspotRouteAnalysis> {
  const now = new Date();
  const periodKey = getDayPeriodFromDate(now);
  const response = await fetch('/api/ai/analyze-hotspot-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidates: params.candidates,
      weather: params.weather,
      costPerKm: params.costPerKm,
      currentHour: now.getHours(),
      dayPeriodLabel: DAY_PERIOD_LABELS[periodKey],
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      errBody.error || 'Não foi possível concluir a análise de rota por IA.'
    );
  }

  return (await response.json()) as AiHotspotRouteAnalysis;
}

/**
 * Fetch current weather from Open-Meteo for the courier's live coordinates
 */
export async function fetchLocalWeather(
  lat: number,
  lng: number
): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(
    4
  )}&longitude=${lng.toFixed(
    4
  )}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Falha ao consultar clima');
  }
  const data = await res.json();
  const current = data.current || {};
  const temp = Number(current.temperature_2m ?? 24);
  const wind = Number(current.wind_speed_10m ?? 10);
  const precip = Number(current.precipitation ?? 0);
  const code = Number(current.weather_code ?? 0);

  let conditionLabel = 'Céu Limpo';
  if (code >= 1 && code <= 3) conditionLabel = 'Parcialmente Nublado';
  else if (code >= 45 && code <= 48) conditionLabel = 'Neblina';
  else if (code >= 51 && code <= 67) conditionLabel = 'Chuva Leve / Garoa';
  else if (code >= 71 && code <= 82) conditionLabel = 'Pancadas de Chuva';
  else if (code >= 95) conditionLabel = 'Tempestade';

  const isBikeAlert = precip > 0.2 || wind >= 25 || code >= 51;

  return {
    temperatureC: Math.round(temp),
    windSpeedKmh: Math.round(wind),
    precipitationMm: Number(precip.toFixed(1)),
    weatherCode: code,
    conditionLabel,
    isBikeAlert,
    updatedAt: new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

/**
 * Export deliveries to CSV
 */
export function exportDeliveriesToCSV(
  deliveries: DeliveryRecord[],
  costPerKm: number
): void {
  const headers = [
    'ID',
    'Data/Hora',
    'Periodo',
    'Aplicativo',
    'Zona/Bairro',
    'Distancia (km)',
    'Duracao (min)',
    'Valor Entrega (R$)',
    'Gorjeta (R$)',
    'Bruto Total (R$)',
    'Custo Bike (R$)',
    'Lucro Liquido (R$)',
    'Modo',
    'Observacoes',
  ];

  const rows = deliveries.map((d) => {
    const gross = d.baseValue + d.tipValue;
    const cost = d.distanceKm * costPerKm;
    const net = gross - cost;
    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
    return [
      d.id,
      new Date(d.date).toLocaleString('pt-BR'),
      DAY_PERIOD_LABELS[d.periodOfDay] || d.periodOfDay,
      d.app,
      escapeCsv(d.zoneName),
      d.distanceKm.toFixed(2),
      (d.durationSeconds / 60).toFixed(1),
      d.baseValue.toFixed(2),
      d.tipValue.toFixed(2),
      gross.toFixed(2),
      cost.toFixed(2),
      net.toFixed(2),
      d.isManual ? 'Manual' : 'GPS Ao Vivo',
      escapeCsv(d.notes),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `estacao-entregador-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export full backup (deliveries + settings) to JSON
 */
export function exportBackupToJSON(
  deliveries: DeliveryRecord[],
  settings: CourierSettings
): void {
  const payload = {
    app: 'Estação do Entregador',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    deliveries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup-estacao-entregador-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseImportedBackup(jsonText: string): {
  deliveries: DeliveryRecord[];
  settings?: Partial<CourierSettings>;
} {
  const parsed = JSON.parse(jsonText);
  if (Array.isArray(parsed)) {
    return { deliveries: parsed as DeliveryRecord[] };
  }
  if (parsed && Array.isArray(parsed.deliveries)) {
    return {
      deliveries: parsed.deliveries as DeliveryRecord[],
      settings: parsed.settings,
    };
  }
  throw new Error('Formato de arquivo de backup inválido.');
}

/**
 * Standard Google Encoded Polyline Algorithm decoder
 */
export function decodeEncodedPolyline(
  encoded: string
): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < len);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < len);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Computes a real street-following bicycle route leg using:
 * 1. Google Maps Routes API v2 SDK (routesLib.Route.computeRoutes)
 * 2. Google Maps DirectionsService (BICYCLING / DRIVING street geometry)
 * 3. OSRM Bike Street Router fallback so the polyline always follows real streets
 */
export async function computeRealStreetBikeLeg(params: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  routesLib?: any;
}): Promise<{
  distanceKm: number;
  durationSeconds: number;
  decodedPath: Array<{ lat: number; lng: number }>;
  encodedPolyline?: string;
}> {
  const { origin, destination, routesLib } = params;

  // 1. Try Google Maps Routes API v2 SDK (static or instance computeRoutes with explicit fields)
  if (routesLib && routesLib.Route) {
    try {
      const RouteClass = routesLib.Route;
      const travelModeVal = routesLib.TravelMode?.BICYCLING ?? 'BICYCLING';
      const requestPayload = {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: travelModeVal,
        fields: ['path', 'distanceMeters', 'durationMillis', 'polyline'],
      };

      const response =
        typeof RouteClass.computeRoutes === 'function'
          ? await RouteClass.computeRoutes(requestPayload)
          : await new RouteClass().computeRoutes(requestPayload);

      if (response?.routes && response.routes.length > 0) {
        const r = response.routes[0];
        let pathCoords: Array<{ lat: number; lng: number }> = [];
        let encodedPoly: string | undefined;

        if (Array.isArray(r.path) && r.path.length >= 2) {
          pathCoords = r.path.map((pt: any) => ({
            lat: typeof pt.lat === 'function' ? pt.lat() : Number(pt.lat),
            lng: typeof pt.lng === 'function' ? pt.lng() : Number(pt.lng),
          }));
        } else if (r.polyline?.encodedPolyline) {
          encodedPoly = r.polyline.encodedPolyline;
          pathCoords = decodeEncodedPolyline(r.polyline.encodedPolyline);
        }

        if (pathCoords.length >= 2) {
          const distMeters = Number(
            r.distanceMeters ??
              calculateDistanceKm(
                origin.lat,
                origin.lng,
                destination.lat,
                destination.lng
              ) * 1250
          );
          const durMillis = Number(
            r.durationMillis ?? (distMeters / 4.4) * 1000
          );
          return {
            distanceKm: Math.max(0.1, Number((distMeters / 1000).toFixed(2))),
            durationSeconds: Math.max(60, Math.round(durMillis / 1000)),
            decodedPath: pathCoords,
            encodedPolyline: encodedPoly,
          };
        }
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
  }

  // 2. Try Google Maps DirectionsService (BICYCLING, then DRIVING street geometry)
  if (typeof google !== 'undefined' && google.maps?.DirectionsService) {
    const directionsService = new google.maps.DirectionsService();
    const modesToTry = [
      google.maps.TravelMode.BICYCLING,
      google.maps.TravelMode.DRIVING,
    ];

    for (const mode of modesToTry) {
      try {
        const dirResult = await directionsService.route({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode: mode,
        });

        if (dirResult?.routes && dirResult.routes.length > 0) {
          const routeObj = dirResult.routes[0];
          const leg = routeObj.legs?.[0];
          let pathCoords: Array<{ lat: number; lng: number }> = [];

          if (
            Array.isArray(routeObj.overview_path) &&
            routeObj.overview_path.length >= 2
          ) {
            pathCoords = routeObj.overview_path.map((pt) => ({
              lat: typeof pt.lat === 'function' ? pt.lat() : Number(pt.lat),
              lng: typeof pt.lng === 'function' ? pt.lng() : Number(pt.lng),
            }));
          } else if (routeObj.overview_polyline) {
            const polyStr =
              typeof routeObj.overview_polyline === 'string'
                ? routeObj.overview_polyline
                : (routeObj.overview_polyline as any).points;
            if (polyStr) {
              pathCoords = decodeEncodedPolyline(polyStr);
            }
          }

          if (pathCoords.length >= 2) {
            const distMeters = Number(
              leg?.distance?.value ??
                calculateDistanceKm(
                  origin.lat,
                  origin.lng,
                  destination.lat,
                  destination.lng
                ) * 1250
            );
            const distKm = Math.max(
              0.1,
              Number((distMeters / 1000).toFixed(2))
            );
            // Adjust duration to realistic bike speed (~16 km/h) if DRIVING fallback was used
            const durSec =
              mode === google.maps.TravelMode.BICYCLING && leg?.duration?.value
                ? leg.duration.value
                : Math.max(60, Math.round((distKm / 16) * 3600));

            return {
              distanceKm: distKm,
              durationSeconds: durSec,
              decodedPath: pathCoords,
            };
          }
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
    }
  }

  // 3. Try OSRM Bicycle Street Router so the map always shows street-level geometry
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/bike/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline`;
    const res = await fetch(osrmUrl);
    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route?.geometry) {
        const decodedPath = decodeEncodedPolyline(route.geometry);
        if (decodedPath.length >= 2) {
          const distKm = Math.max(
            0.1,
            Number(((route.distance || 500) / 1000).toFixed(2))
          );
          const durSec = Math.max(60, Math.round((distKm / 16) * 3600));
          return {
            distanceKm: distKm,
            durationSeconds: durSec,
            decodedPath,
            encodedPolyline: route.geometry,
          };
        }
      }
    }
  } catch {
    // Ignore offline fallback error
  }

  // Final geometric fallback if completely offline
  const straightKm = calculateDistanceKm(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng
  );
  const fallbackKm = Math.max(0.15, Number((straightKm * 1.24).toFixed(2)));
  const fallbackSec = Math.max(60, Math.round((fallbackKm / 16) * 3600));
  return {
    distanceKm: fallbackKm,
    durationSeconds: fallbackSec,
    decodedPath: [origin, destination],
  };
}

/**
 * Builds the official Google Maps Universal Cross-Platform URL for Bicycling navigation.
 * On Android (Redmi Note 12) and iOS, this URL launches the native Google Maps app
 * directly with the origin, waypoints, destination, and bicycling mode pre-selected.
 */
export function buildGoogleMapsNavigationUrl(params: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: Array<{ lat: number; lng: number }>;
  travelMode?: 'bicycling' | 'driving' | 'walking';
}): string {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set(
    'origin',
    `${params.origin.lat.toFixed(6)},${params.origin.lng.toFixed(6)}`
  );
  url.searchParams.set(
    'destination',
    `${params.destination.lat.toFixed(6)},${params.destination.lng.toFixed(6)}`
  );
  if (params.waypoints && params.waypoints.length > 0) {
    url.searchParams.set(
      'waypoints',
      params.waypoints
        .map((w) => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`)
        .join('|')
    );
  }
  url.searchParams.set('travelmode', params.travelMode || 'bicycling');
  url.searchParams.set('dir_action', 'navigate');
  return url.toString();
}

/**
 * Opens/redirects to the Google Maps app (or web tab) with the route already loaded.
 */
export function openRouteInGoogleMapsApp(params: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: Array<{ lat: number; lng: number }>;
  travelMode?: 'bicycling' | 'driving' | 'walking';
}): void {
  const navUrl = buildGoogleMapsNavigationUrl(params);
  const anchor = document.createElement('a');
  anchor.href = navUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

