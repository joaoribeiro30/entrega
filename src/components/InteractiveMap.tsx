import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  MapCameraChangedEvent,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { LayersList } from '@deck.gl/core';
import {
  Bike,
  CloudRain,
  Compass,
  ExternalLink,
  Filter,
  Flame,
  Layers,
  LocateFixed,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  Utensils,
  Wind,
  X,
} from 'lucide-react';
import {
  ComputedMultiRoute,
  CuisineCategory,
  DeliveryRecord,
  MapLayersState,
  RestaurantClusterSuggestion,
  RestaurantFilterState,
  RestaurantPoint,
  RoutePoint,
  RouteStop,
  WeatherData,
} from '../types';
import {
  calculateDistanceKm,
  computeRealStreetBikeLeg,
  formatCurrency,
  formatDuration,
  formatDurationCompact,
  formatKm,
  identifyBestRestaurantCluster,
  identifyTopRestaurantClusters,
  openRouteInGoogleMapsApp,
  playHotspotAlertSound,
  requestAiHotspotRouteAnalysis,
  triggerGoalNotification,
} from '../utils/geoAndSound';

interface InteractiveMapProps {
  userLocation: { lat: number; lng: number };
  hasRealGpsFix: boolean;
  isTracking: boolean;
  liveRoutePath: RoutePoint[];
  deliveries: DeliveryRecord[];
  layers: MapLayersState;
  onToggleLayer: (key: keyof MapLayersState) => void;
  restaurantFilters: RestaurantFilterState;
  onUpdateRestaurantFilters: (patch: Partial<RestaurantFilterState>) => void;
  replayDelivery: DeliveryRecord | null;
  onCloseReplay: () => void;
  plannedRoute: ComputedMultiRoute | null;
  plannedStops: RouteStop[];
  onApplyClusterRoute: (route: ComputedMultiRoute, stops: RouteStop[]) => void;
  onClearPlannedRoute: () => void;
  weather: WeatherData | null;
  costPerKm: number;
  soundAlertsEnabled: boolean;
  onRecenterGps: () => void;
  onDetectZoneName?: (zone: string) => void;
}

const CUISINE_OPTIONS: Array<{
  value: CuisineCategory;
  label: string;
  queryText: string;
}> = [
  { value: 'all', label: 'Todos', queryText: 'restaurantes e lanchonetes delivery' },
  { value: 'fast_food', label: 'Lanches', queryText: 'hamburgueria fast food lanches' },
  { value: 'pizza', label: 'Pizza', queryText: 'pizzaria delivery' },
  { value: 'japanese', label: 'Japonesa', queryText: 'restaurante japones sushi' },
  { value: 'brazilian', label: 'Brasileira', queryText: 'restaurante comida brasileira marmitex' },
  { value: 'bakery', label: 'Padaria/Açaí', queryText: 'padaria confeitaria acai' },
];

function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * Deck.gl Heatmap & Visual Layers Overlay
 */
const DeckGlHeatmapController: React.FC<{
  restaurants: RestaurantPoint[];
  personalPoints: Array<{ lat: number; lng: number; weight: number }>;
  showRestaurantHeatmap: boolean;
  showPersonalHeatmap: boolean;
}> = ({
  restaurants,
  personalPoints,
  showRestaurantHeatmap,
  showPersonalHeatmap,
}) => {
  const map = useMap();
  const supportsWebGL2 = useMemo(() => isWebGL2Available(), []);
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);

  // Fallback thermal circles when WebGL2 is unavailable (e.g. headless browser)
  const fallbackCirclesRef = useRef<google.maps.Circle[]>([]);

  useEffect(() => {
    if (!map || !supportsWebGL2) return;
    try {
      const overlay = new GoogleMapsOverlay({ interleaved: false });
      overlay.setMap(map);
      overlayRef.current = overlay;
      return () => {
        overlay.setMap(null);
        overlayRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [map, supportsWebGL2]);

  const deckLayers = useMemo(() => {
    if (!supportsWebGL2) return [];
    const list: LayersList = [];

    if (showRestaurantHeatmap && restaurants.length > 0) {
      list.push(
        new HeatmapLayer<RestaurantPoint>({
          id: 'restaurants-demand-heatmap',
          data: restaurants,
          getPosition: (d) => [d.lng, d.lat],
          getWeight: (d) => d.weight,
          radiusPixels: 55,
          intensity: 1.4,
          threshold: 0.04,
          colorRange: [
            [254, 240, 138, 90],
            [253, 186, 116, 150],
            [249, 115, 22, 195],
            [239, 68, 68, 225],
            [185, 28, 28, 250],
          ],
        })
      );
    }

    if (showPersonalHeatmap && personalPoints.length > 0) {
      list.push(
        new HeatmapLayer<{ lat: number; lng: number; weight: number }>({
          id: 'personal-deliveries-heatmap',
          data: personalPoints,
          getPosition: (d) => [d.lng, d.lat],
          getWeight: (d) => d.weight,
          radiusPixels: 48,
          intensity: 1.5,
          threshold: 0.05,
          colorRange: [
            [167, 243, 208, 95],
            [52, 211, 153, 160],
            [16, 185, 129, 210],
            [5, 150, 105, 240],
            [4, 120, 87, 255],
          ],
        })
      );
    }

    return list;
  }, [
    supportsWebGL2,
    showRestaurantHeatmap,
    showPersonalHeatmap,
    restaurants,
    personalPoints,
  ]);

  useEffect(() => {
    if (overlayRef.current && supportsWebGL2) {
      try {
        overlayRef.current.setProps({ layers: deckLayers });
      } catch {
        // Ignore WebGL context loss
      }
    }
  }, [deckLayers, supportsWebGL2]);

  // Render subtle thermal aura circles on the Google Map so heatmap zones are always crisp
  useEffect(() => {
    fallbackCirclesRef.current.forEach((c) => c.setMap(null));
    fallbackCirclesRef.current = [];
    if (!map) return;

    if (showRestaurantHeatmap && restaurants.length > 0) {
      restaurants.forEach((r) => {
        const circle = new google.maps.Circle({
          map,
          center: { lat: r.lat, lng: r.lng },
          radius: 140 + Math.min(r.weight * 25, 160),
          fillColor: r.weight >= 4.5 ? '#EF4444' : '#F97316',
          fillOpacity: supportsWebGL2 ? 0.14 : 0.28,
          strokeWeight: 0,
          clickable: false,
        });
        fallbackCirclesRef.current.push(circle);
      });
    }

    if (showPersonalHeatmap && personalPoints.length > 0) {
      personalPoints.forEach((pt) => {
        const circle = new google.maps.Circle({
          map,
          center: { lat: pt.lat, lng: pt.lng },
          radius: 120,
          fillColor: '#10B981',
          fillOpacity: supportsWebGL2 ? 0.16 : 0.3,
          strokeWeight: 0,
          clickable: false,
        });
        fallbackCirclesRef.current.push(circle);
      });
    }

    return () => {
      fallbackCirclesRef.current.forEach((c) => c.setMap(null));
      fallbackCirclesRef.current = [];
    };
  }, [
    map,
    supportsWebGL2,
    showRestaurantHeatmap,
    showPersonalHeatmap,
    restaurants,
    personalPoints,
  ]);

  return null;
};

/**
 * Native Google Maps layers (Traffic, Bicycling, Live Route Polyline, Replay Polyline, Planned Route Polyline)
 */
const NativeMapSublayers: React.FC<{
  showTraffic: boolean;
  showBikeLanes: boolean;
  liveRoutePath: RoutePoint[];
  replayPath: RoutePoint[];
  plannedRoute: ComputedMultiRoute | null;
}> = ({
  showTraffic,
  showBikeLanes,
  liveRoutePath,
  replayPath,
  plannedRoute,
}) => {
  const map = useMap();
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const bikeLayerRef = useRef<google.maps.BicyclingLayer | null>(null);
  const livePolylineRef = useRef<google.maps.Polyline | null>(null);
  const replayPolylineRef = useRef<google.maps.Polyline | null>(null);
  const plannedPolylinesRef = useRef<google.maps.Polyline[]>([]);

  // Traffic Layer
  useEffect(() => {
    if (!map) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }
    return () => {
      if (trafficLayerRef.current) trafficLayerRef.current.setMap(null);
    };
  }, [map, showTraffic]);

  // Bicycling Layer
  useEffect(() => {
    if (!map) return;
    if (showBikeLanes) {
      if (!bikeLayerRef.current) {
        bikeLayerRef.current = new google.maps.BicyclingLayer();
      }
      bikeLayerRef.current.setMap(map);
    } else if (bikeLayerRef.current) {
      bikeLayerRef.current.setMap(null);
    }
    return () => {
      if (bikeLayerRef.current) bikeLayerRef.current.setMap(null);
    };
  }, [map, showBikeLanes]);

  // Live Delivery Route Polyline
  useEffect(() => {
    if (!map) return;
    if (livePolylineRef.current) {
      livePolylineRef.current.setMap(null);
      livePolylineRef.current = null;
    }
    if (liveRoutePath.length >= 2) {
      const poly = new google.maps.Polyline({
        path: liveRoutePath.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: '#10B981',
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map,
      });
      livePolylineRef.current = poly;
    }
    return () => {
      if (livePolylineRef.current) livePolylineRef.current.setMap(null);
    };
  }, [map, liveRoutePath]);

  // Replay Route Polyline
  useEffect(() => {
    if (!map) return;
    if (replayPolylineRef.current) {
      replayPolylineRef.current.setMap(null);
      replayPolylineRef.current = null;
    }
    if (replayPath.length >= 2) {
      const poly = new google.maps.Polyline({
        path: replayPath.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: '#F59E0B',
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map,
      });
      replayPolylineRef.current = poly;

      const bounds = new google.maps.LatLngBounds();
      replayPath.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 60);
    }
    return () => {
      if (replayPolylineRef.current) replayPolylineRef.current.setMap(null);
    };
  }, [map, replayPath]);

  // Planned Multi-Stop Bike Route Polylines
  useEffect(() => {
    plannedPolylinesRef.current.forEach((p) => p.setMap(null));
    plannedPolylinesRef.current = [];
    if (!map || !plannedRoute || plannedRoute.decodedPaths.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    plannedRoute.decodedPaths.forEach((pathCoords) => {
      pathCoords.forEach((pt) => bounds.extend(pt));
      const poly = new google.maps.Polyline({
        path: pathCoords,
        geodesic: true,
        strokeColor: '#3B82F6',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
      });
      plannedPolylinesRef.current.push(poly);
    });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 64);
    }

    return () => {
      plannedPolylinesRef.current.forEach((p) => p.setMap(null));
      plannedPolylinesRef.current = [];
    };
  }, [map, plannedRoute]);

  return null;
};

/**
 * Places API (New) Demand Scanner Inside Map Context
 */
const RestaurantDemandScanner: React.FC<{
  searchCenter: { lat: number; lng: number };
  filters: RestaurantFilterState;
  refreshTrigger: number;
  onRestaurantsLoaded: (items: RestaurantPoint[]) => void;
  onLoadingChange: (loading: boolean) => void;
  onDetectZoneName?: (zone: string) => void;
}> = ({
  searchCenter,
  filters,
  refreshTrigger,
  onRestaurantsLoaded,
  onLoadingChange,
  onDetectZoneName,
}) => {
  const placesLib = useMapsLibrary('places');
  const lastQueriedKeyRef = useRef<string>('');

  useEffect(() => {
    if (!placesLib || !placesLib.Place) return;

    const queryKey = `${searchCenter.lat.toFixed(3)},${searchCenter.lng.toFixed(
      3
    )}-${filters.cuisineType}-${refreshTrigger}`;
    if (lastQueriedKeyRef.current === queryKey) return;
    lastQueriedKeyRef.current = queryKey;

    let cancelled = false;
    onLoadingChange(true);

    const cuisineObj =
      CUISINE_OPTIONS.find((c) => c.value === filters.cuisineType) ||
      CUISINE_OPTIONS[0];

    const runSearch = async () => {
      try {
        const { places } = await placesLib.Place.searchByText({
          textQuery: cuisineObj.queryText,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'regularOpeningHours',
            'primaryTypeDisplayName',
          ],
          locationBias: {
            center: searchCenter,
            radius: 2500,
          },
          maxResultCount: 20,
        });

        if (cancelled) return;

        const mapped: RestaurantPoint[] = (places || [])
          .filter((p: any) => p.location)
          .map((p: any, idx: number) => {
            const lat = p.location!.lat();
            const lng = p.location!.lng();
            const rating = Number(p.rating ?? 4.3);
            const count = Number(p.userRatingCount ?? 50);
            const isOpen = true;
            const weight = Math.max(
              1.5,
              rating * (1 + Math.min(count, 500) / 250)
            );
            return {
              id: p.id || `rest-${idx}`,
              name: p.displayName || 'Restaurante Parceiro',
              address: p.formattedAddress || 'Região Central',
              lat,
              lng,
              rating,
              userRatingCount: count,
              isOpen,
              cuisineType: filters.cuisineType,
              cuisineLabel: p.primaryTypeDisplayName || cuisineObj.label,
              weight,
            };
          });

        // Extract neighborhood/zone name from first result's formatted address if available
        if (mapped.length > 0 && onDetectZoneName) {
          const parts = mapped[0].address.split('-');
          if (parts.length >= 2) {
            const neighborhood = parts[1].split(',')[0].trim();
            if (neighborhood && neighborhood.length > 2) {
              onDetectZoneName(neighborhood);
            }
          }
        }

        onRestaurantsLoaded(mapped);
      } catch (err) {
        const msg = String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        console.error('Erro ao buscar densidade de restaurantes:', err);
      } finally {
        if (!cancelled) onLoadingChange(false);
      }
    };

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [
    placesLib,
    searchCenter,
    filters.cuisineType,
    refreshTrigger,
    onRestaurantsLoaded,
    onLoadingChange,
    onDetectZoneName,
  ]);

  return null;
};

/**
 * High-Demand Hotspot Detector, Routes API Calculator & AI Route Analyzer
 */
const HighDemandClusterRouter: React.FC<{
  restaurants: RestaurantPoint[];
  userLocation: { lat: number; lng: number };
  weather: WeatherData | null;
  costPerKm: number;
  triggerEvaluationCount: number;
  soundAlertsEnabled: boolean;
  onAnalyzingChange: (analyzing: boolean) => void;
  onSuggestionReady: (suggestion: RestaurantClusterSuggestion | null) => void;
}> = ({
  restaurants,
  userLocation,
  weather,
  costPerKm,
  triggerEvaluationCount,
  soundAlertsEnabled,
  onAnalyzingChange,
  onSuggestionReady,
}) => {
  const routesLib = useMapsLibrary('routes');
  const lastEvaluatedClusterIdRef = useRef<string>('');

  useEffect(() => {
    if (!restaurants || restaurants.length === 0) {
      onSuggestionReady(null);
      return;
    }

    const topClusters = identifyTopRestaurantClusters(
      restaurants,
      userLocation,
      3
    );
    const primaryCluster =
      topClusters[0] || identifyBestRestaurantCluster(restaurants, userLocation);

    if (!primaryCluster) {
      return;
    }

    // Automatically trigger when courier is in/near a hotspot OR when user explicitly requests AI analysis
    if (!primaryCluster.isCourierInsideHotspot && triggerEvaluationCount === 0) {
      return;
    }

    const evaluationKey = `${primaryCluster.id}-${triggerEvaluationCount}-${userLocation.lat.toFixed(
      3
    )},${userLocation.lng.toFixed(3)}`;
    if (lastEvaluatedClusterIdRef.current === evaluationKey) return;
    lastEvaluatedClusterIdRef.current = evaluationKey;

    let cancelled = false;
    onAnalyzingChange(true);

    const computeSingleCandidateRoute = async (
      cluster: Omit<RestaurantClusterSuggestion, 'suggestedRoute'>
    ): Promise<ComputedMultiRoute> => {
      const legResult = await computeRealStreetBikeLeg({
        origin: userLocation,
        destination: cluster.center,
        routesLib,
      });

      return {
        totalDistanceKm: legResult.distanceKm,
        totalDurationSeconds: legResult.durationSeconds,
        encodedPolylines: legResult.encodedPolyline
          ? [legResult.encodedPolyline]
          : [],
        decodedPaths: [legResult.decodedPath],
        legs: [
          {
            startAddress: 'Minha Posição (GPS)',
            endAddress: `${cluster.clusterName} (${cluster.anchorRestaurantName})`,
            distanceKm: legResult.distanceKm,
            durationSeconds: legResult.durationSeconds,
          },
        ],
      };
    };

    const runHotspotAndAiAnalysis = async () => {
      try {
        const candidatesToEvaluate =
          topClusters.length > 0 ? topClusters : [primaryCluster];

        const candidatesWithRoutes: RestaurantClusterSuggestion[] =
          await Promise.all(
            candidatesToEvaluate.map(async (cluster) => {
              const suggestedRoute = await computeSingleCandidateRoute(cluster);
              return {
                ...cluster,
                suggestedRoute,
              };
            })
          );

        if (cancelled) return;

        // First surface immediate suggestion while AI finishes analyzing
        const initialBest = candidatesWithRoutes[0];
        onSuggestionReady(initialBest);

        try {
          // Request Gemini AI analysis comparing routes from current origin to high-heatmap zones
          const aiCandidatesPayload = candidatesWithRoutes.map((c) => {
            const distKm =
              c.suggestedRoute?.totalDistanceKm ?? c.distanceFromCourierKm;
            const durSec = c.suggestedRoute?.totalDurationSeconds ?? 180;
            return {
              clusterId: c.id,
              zoneLabel: c.clusterName,
              restaurantCount: c.restaurantCount,
              heatmapDemandScore: c.totalDemandScore,
              routeDistanceKm: distKm,
              routeDurationMinutes: Number((durSec / 60).toFixed(1)),
              estimatedBikeCostBrl: Number((distKm * costPerKm).toFixed(2)),
            };
          });

          const aiAnalysis = await requestAiHotspotRouteAnalysis({
            candidates: aiCandidatesPayload,
            weather,
            costPerKm,
          });

          if (cancelled) return;

          const chosenCluster =
            candidatesWithRoutes.find(
              (c) => c.id === aiAnalysis.selectedClusterId
            ) || initialBest;

          const finalSuggestion: RestaurantClusterSuggestion = {
            ...chosenCluster,
            aiAnalysis,
          };

          onSuggestionReady(finalSuggestion);
          playHotspotAlertSound(soundAlertsEnabled);

          if (chosenCluster.suggestedRoute) {
            triggerGoalNotification(
              `IA · ${chosenCluster.clusterName}`,
              `${aiAnalysis.headline} (${formatKm(
                chosenCluster.suggestedRoute.totalDistanceKm
              )} · ${formatDurationCompact(
                chosenCluster.suggestedRoute.totalDurationSeconds
              )} de bike)`
            );
          }
        } catch {
          // Keep initial Routes API suggestion if AI analysis endpoint is temporarily unavailable
          playHotspotAlertSound(soundAlertsEnabled);
        }
      } finally {
        if (!cancelled) {
          onAnalyzingChange(false);
        }
      }
    };

    void runHotspotAndAiAnalysis();

    return () => {
      cancelled = true;
    };
  }, [
    restaurants,
    userLocation,
    weather,
    costPerKm,
    routesLib,
    triggerEvaluationCount,
    soundAlertsEnabled,
    onAnalyzingChange,
    onSuggestionReady,
  ]);

  return null;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  userLocation,
  hasRealGpsFix,
  isTracking,
  liveRoutePath,
  deliveries,
  layers,
  onToggleLayer,
  restaurantFilters,
  onUpdateRestaurantFilters,
  replayDelivery,
  onCloseReplay,
  plannedRoute,
  plannedStops,
  onApplyClusterRoute,
  onClearPlannedRoute,
  weather,
  costPerKm,
  soundAlertsEnabled,
  onRecenterGps,
  onDetectZoneName,
}) => {
  const [cameraCenter, setCameraCenter] = useState(userLocation);
  const [zoom, setZoom] = useState(14);
  const [followUser, setFollowUser] = useState(true);

  const [rawRestaurants, setRawRestaurants] = useState<RestaurantPoint[]>([]);
  const [isScanningPlaces, setIsScanningPlaces] = useState(false);
  const [refreshScanCount, setRefreshScanCount] = useState(0);
  const [scanCenter, setScanCenter] = useState(userLocation);

  const [clusterSuggestion, setClusterSuggestion] =
    useState<RestaurantClusterSuggestion | null>(null);
  const [dismissedClusterId, setDismissedClusterId] = useState<string | null>(
    null
  );
  const [hotspotEvalTrigger, setHotspotEvalTrigger] = useState(0);
  const [isAnalyzingAiRoute, setIsAnalyzingAiRoute] = useState(false);

  const [selectedRestaurant, setSelectedRestaurant] =
    useState<RestaurantPoint | null>(null);
  const [selectedDeliveryPin, setSelectedDeliveryPin] =
    useState<DeliveryRecord | null>(null);

  const [showLayerDrawer, setShowLayerDrawer] = useState(false);
  const [showRestaurantFilterDrawer, setShowRestaurantFilterDrawer] =
    useState(false);

  // Replay animation state
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(true);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);

  // Keep camera synced when following user GPS
  useEffect(() => {
    if (followUser && !replayDelivery && !plannedRoute) {
      setCameraCenter(userLocation);
    }
  }, [userLocation, followUser, replayDelivery, plannedRoute]);

  // Update initial scan center once real GPS fix arrives
  useEffect(() => {
    if (hasRealGpsFix) {
      setScanCenter(userLocation);
    }
  }, [hasRealGpsFix]);

  // Filter restaurants client-side for instant responsiveness on rating & openNow
  const filteredRestaurants = useMemo(() => {
    return rawRestaurants.filter((r) => {
      if (r.rating < restaurantFilters.minRating) return false;
      if (restaurantFilters.openNow && !r.isOpen) return false;
      return true;
    });
  }, [rawRestaurants, restaurantFilters.minRating, restaurantFilters.openNow]);

  // Compute personal heatmap points from user's saved deliveries
  const personalHeatmapPoints = useMemo(() => {
    const pts: Array<{ lat: number; lng: number; weight: number }> = [];
    deliveries.forEach((d) => {
      const totalVal = d.baseValue + d.tipValue;
      if (d.routePath && d.routePath.length > 0) {
        const lastPt = d.routePath[d.routePath.length - 1];
        const firstPt = d.routePath[0];
        pts.push({
          lat: lastPt.lat,
          lng: lastPt.lng,
          weight: Math.max(2, totalVal / 5),
        });
        if (d.routePath.length > 1) {
          pts.push({
            lat: firstPt.lat,
            lng: firstPt.lng,
            weight: Math.max(1.5, totalVal / 8),
          });
        }
      }
    });
    return pts;
  }, [deliveries]);

  // Replay timer loop
  useEffect(() => {
    if (!replayDelivery || !replayDelivery.routePath.length) {
      setReplayIndex(0);
      return;
    }
    setReplayIndex(0);
    setIsReplayPlaying(true);
  }, [replayDelivery]);

  useEffect(() => {
    if (
      !replayDelivery ||
      !isReplayPlaying ||
      replayDelivery.routePath.length < 2
    ) {
      return;
    }
    const intervalMs = Math.max(80, Math.round(450 / replaySpeed));
    const timer = window.setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= replayDelivery.routePath.length - 1) {
          setIsReplayPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [replayDelivery, isReplayPlaying, replaySpeed]);

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    setCameraCenter(ev.detail.center);
    setZoom(ev.detail.zoom);
  }, []);

  const handleRecenter = () => {
    setFollowUser(true);
    setCameraCenter(userLocation);
    setZoom(15);
    onRecenterGps();
  };

  const handleScanAreaHere = () => {
    setScanCenter(cameraCenter);
    setDismissedClusterId(null);
    setRefreshScanCount((c) => c + 1);
  };

  const handleTriggerAiRouteAnalysis = () => {
    setDismissedClusterId(null);
    setHotspotEvalTrigger((c) => c + 1);
  };

  const handleAcceptClusterRoute = () => {
    if (!clusterSuggestion || !clusterSuggestion.suggestedRoute) return;
    const stopsForCluster: RouteStop[] = [
      {
        id: 'origin-gps-hotspot',
        label: 'Minha Posição (GPS)',
        address: `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`,
        lat: userLocation.lat,
        lng: userLocation.lng,
      },
      {
        id: `cluster-dest-${clusterSuggestion.id}`,
        label: clusterSuggestion.clusterName,
        address: `Próximo a ${clusterSuggestion.anchorRestaurantName}`,
        lat: clusterSuggestion.center.lat,
        lng: clusterSuggestion.center.lng,
      },
    ];
    onApplyClusterRoute(clusterSuggestion.suggestedRoute, stopsForCluster);
    setDismissedClusterId(clusterSuggestion.id);

    // Redirect/open the native Google Maps app with the bicycling route already loaded
    openRouteInGoogleMapsApp({
      origin: userLocation,
      destination: clusterSuggestion.center,
      travelMode: 'bicycling',
    });
  };

  const handleOpenPlannedRouteInGoogleMaps = () => {
    if (plannedStops.length >= 2) {
      const originStop = plannedStops[0];
      const destStop = plannedStops[plannedStops.length - 1];
      const middleStops = plannedStops.slice(1, -1);
      openRouteInGoogleMapsApp({
        origin: { lat: originStop.lat, lng: originStop.lng },
        destination: { lat: destStop.lat, lng: destStop.lng },
        waypoints: middleStops.map((s) => ({ lat: s.lat, lng: s.lng })),
        travelMode: 'bicycling',
      });
    } else if (clusterSuggestion) {
      openRouteInGoogleMapsApp({
        origin: userLocation,
        destination: clusterSuggestion.center,
        travelMode: 'bicycling',
      });
    }
  };

  const showHotspotNotification =
    clusterSuggestion &&
    clusterSuggestion.suggestedRoute &&
    dismissedClusterId !== clusterSuggestion.id &&
    !replayDelivery;

  const currentReplayPoint =
    replayDelivery && replayDelivery.routePath[replayIndex]
      ? replayDelivery.routePath[replayIndex]
      : null;

  return (
    <div className="relative w-full h-full min-h-[380px] bg-slate-900 overflow-hidden select-none">
      <GoogleMap
        center={cameraCenter}
        zoom={zoom}
        onCameraChanged={handleCameraChanged}
        onDragstart={() => setFollowUser(false)}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        disableDefaultUI={true}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Places API (New) Demand Scanner */}
        <RestaurantDemandScanner
          searchCenter={scanCenter}
          filters={restaurantFilters}
          refreshTrigger={refreshScanCount}
          onRestaurantsLoaded={setRawRestaurants}
          onLoadingChange={setIsScanningPlaces}
          onDetectZoneName={onDetectZoneName}
        />

        {/* High-Demand Point, Routes API & Gemini AI Route Analyzer */}
        <HighDemandClusterRouter
          restaurants={filteredRestaurants}
          userLocation={userLocation}
          weather={weather}
          costPerKm={costPerKm}
          triggerEvaluationCount={hotspotEvalTrigger}
          soundAlertsEnabled={soundAlertsEnabled}
          onAnalyzingChange={setIsAnalyzingAiRoute}
          onSuggestionReady={setClusterSuggestion}
        />

        {/* Deck.gl & Thermal Heatmap Overlays */}
        <DeckGlHeatmapController
          restaurants={filteredRestaurants}
          personalPoints={personalHeatmapPoints}
          showRestaurantHeatmap={layers.restaurantHeatmap}
          showPersonalHeatmap={layers.personalHeatmap}
        />

        {/* Native Polylines & Traffic/Bike Layers */}
        <NativeMapSublayers
          showTraffic={layers.traffic}
          showBikeLanes={layers.bikeLanes}
          liveRoutePath={liveRoutePath}
          replayPath={replayDelivery ? replayDelivery.routePath : []}
          plannedRoute={plannedRoute}
        />

        {/* Current User Bike GPS Location Pin */}
        <AdvancedMarker position={userLocation} title="Minha Posição (Bike)">
          <div className="relative flex items-center justify-center">
            {isTracking && (
              <span className="absolute w-11 h-11 rounded-full bg-emerald-500/35 animate-ping" />
            )}
            <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950 shadow-lg flex items-center justify-center text-slate-950">
              <Bike className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
        </AdvancedMarker>

        {/* High-Demand Cluster Centroid Target Marker */}
        {clusterSuggestion && layers.restaurantHeatmap && (
          <AdvancedMarker
            position={clusterSuggestion.center}
            onClick={() => setDismissedClusterId(null)}
          >
            <div className="px-2.5 py-1 rounded-xl bg-amber-500 border-2 border-slate-950 text-slate-950 shadow-xl flex items-center gap-1.5 text-xs font-bold cursor-pointer">
              <Flame className="w-3.5 h-3.5 fill-slate-950 shrink-0" />
              <span className="whitespace-nowrap">
                {clusterSuggestion.clusterName} (
                {clusterSuggestion.restaurantCount})
              </span>
            </div>
          </AdvancedMarker>
        )}

        {/* Restaurant Markers when Restaurant Heatmap is active */}
        {layers.restaurantHeatmap &&
          filteredRestaurants.map((rest) => (
            <AdvancedMarker
              key={rest.id}
              position={{ lat: rest.lat, lng: rest.lng }}
              onClick={() => setSelectedRestaurant(rest)}
            >
              <div className="px-2 py-1 rounded-lg bg-slate-900/90 border border-orange-500/60 text-white shadow-md flex items-center gap-1 text-[11px] font-medium hover:scale-105 transition-transform cursor-pointer">
                <Utensils className="w-3 h-3 text-orange-400 shrink-0" />
                <span className="font-mono tabular-nums text-amber-300">
                  {rest.rating.toFixed(1)}
                </span>
              </div>
            </AdvancedMarker>
          ))}

        {/* Personal Delivery Endpoint Markers ("Meus Pontos") */}
        {layers.myPoints &&
          deliveries.map((del) => {
            const endPt =
              del.routePath && del.routePath.length > 0
                ? del.routePath[del.routePath.length - 1]
                : null;
            if (!endPt) return null;
            return (
              <AdvancedMarker
                key={del.id}
                position={{ lat: endPt.lat, lng: endPt.lng }}
                onClick={() => setSelectedDeliveryPin(del)}
              >
                <div className="px-2 py-1 rounded-lg bg-emerald-950/95 border border-emerald-400/70 text-emerald-200 shadow-md flex items-center gap-1 text-[11px] font-mono tabular-nums cursor-pointer">
                  <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>{formatCurrency(del.baseValue + del.tipValue)}</span>
                </div>
              </AdvancedMarker>
            );
          })}

        {/* Planned Multi-Stop Route Waypoint Markers */}
        {plannedStops.map((stop, idx) => (
          <AdvancedMarker
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
          >
            <div className="px-2.5 py-1 rounded-lg bg-blue-600 border-2 border-white text-white shadow-lg flex items-center gap-1.5 text-xs font-bold">
              <span className="w-4 h-4 rounded-full bg-white text-blue-700 flex items-center justify-center text-[10px] font-mono">
                {idx + 1}
              </span>
              <span className="max-w-[110px] truncate">{stop.label}</span>
            </div>
          </AdvancedMarker>
        ))}

        {/* Replay Animated Bike Cursor */}
        {replayDelivery && currentReplayPoint && (
          <AdvancedMarker
            position={{
              lat: currentReplayPoint.lat,
              lng: currentReplayPoint.lng,
            }}
          >
            <div className="w-9 h-9 rounded-full bg-amber-500 border-2 border-slate-950 shadow-xl flex items-center justify-center text-slate-950">
              <Bike className="w-5 h-5 stroke-[2.5]" />
            </div>
          </AdvancedMarker>
        )}

        {/* Selected Restaurant InfoWindow */}
        {selectedRestaurant && (
          <InfoWindow
            position={{
              lat: selectedRestaurant.lat,
              lng: selectedRestaurant.lng,
            }}
            onCloseClick={() => setSelectedRestaurant(null)}
          >
            <div className="p-1 text-slate-900 max-w-[220px]">
              <p className="font-bold text-sm leading-snug">
                {selectedRestaurant.name}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {selectedRestaurant.cuisineLabel} · ★{' '}
                {selectedRestaurant.rating.toFixed(1)} (
                {selectedRestaurant.userRatingCount})
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {selectedRestaurant.address}
              </p>
            </div>
          </InfoWindow>
        )}

        {/* Selected Personal Delivery InfoWindow */}
        {selectedDeliveryPin &&
          selectedDeliveryPin.routePath.length > 0 && (
            <InfoWindow
              position={{
                lat: selectedDeliveryPin.routePath[
                  selectedDeliveryPin.routePath.length - 1
                ].lat,
                lng: selectedDeliveryPin.routePath[
                  selectedDeliveryPin.routePath.length - 1
                ].lng,
              }}
              onCloseClick={() => setSelectedDeliveryPin(null)}
            >
              <div className="p-1 text-slate-900 max-w-[220px]">
                <p className="font-bold text-sm">
                  {selectedDeliveryPin.app} —{' '}
                  {formatCurrency(
                    selectedDeliveryPin.baseValue + selectedDeliveryPin.tipValue
                  )}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {formatKm(selectedDeliveryPin.distanceKm)} ·{' '}
                  {selectedDeliveryPin.zoneName}
                </p>
                {selectedDeliveryPin.notes && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {selectedDeliveryPin.notes}
                  </p>
                )}
              </div>
            </InfoWindow>
          )}
      </GoogleMap>

      {/* Top Floating Controls Bar: Layer Toggles & Demand Scan */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              setShowLayerDrawer((v) => !v);
              setShowRestaurantFilterDrawer(false);
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md transition-colors whitespace-nowrap shrink-0 ${
              showLayerDrawer
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-900/90 text-slate-100 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Camadas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowRestaurantFilterDrawer((v) => !v);
              setShowLayerDrawer(false);
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md transition-colors whitespace-nowrap shrink-0 ${
              showRestaurantFilterDrawer
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900/90 text-slate-100 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <Filter className="w-4 h-4 text-amber-400" />
            <span>
              Demanda ({filteredRestaurants.length})
            </span>
          </button>

          <button
            type="button"
            onClick={handleScanAreaHere}
            disabled={isScanningPlaces}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700/80 text-xs font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors whitespace-nowrap shrink-0"
            title="Escanear restaurantes nesta área do mapa"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-emerald-400 ${
                isScanningPlaces ? 'animate-spin' : ''
              }`}
            />
            <span className="hidden sm:inline">Buscar Aqui</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerAiRouteAnalysis}
            disabled={isAnalyzingAiRoute}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-500/95 hover:bg-amber-400 text-slate-950 border border-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors whitespace-nowrap shrink-0"
            title="Analisar por IA a melhor rota saindo do ponto atual até uma zona com heatmap alto"
          >
            <Sparkles
              className={`w-3.5 h-3.5 fill-slate-950 ${
                isAnalyzingAiRoute ? 'animate-spin' : ''
              }`}
            />
            <span>{isAnalyzingAiRoute ? 'Analisando IA...' : 'Rota IA Heatmap'}</span>
          </button>
        </div>

        {/* Weather Overlay Card on Map when active */}
        {layers.weatherOverlay && weather && (
          <div
            className={`pointer-events-auto px-3 py-2 rounded-xl border backdrop-blur-md shadow-lg flex items-center gap-2.5 text-xs ${
              weather.isBikeAlert
                ? 'bg-amber-950/90 border-amber-500/70 text-amber-100'
                : 'bg-slate-900/90 border-slate-700/80 text-slate-100'
            }`}
          >
            <CloudRain
              className={`w-4 h-4 shrink-0 ${
                weather.isBikeAlert ? 'text-amber-400' : 'text-sky-400'
              }`}
            />
            <div className="leading-tight">
              <div className="font-semibold flex items-center gap-1.5">
                <span className="font-mono tabular-nums">
                  {weather.temperatureC}°C
                </span>
                <span>·</span>
                <span>{weather.conditionLabel}</span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-2 mt-0.5 font-mono tabular-nums">
                <span className="flex items-center gap-1">
                  <Wind className="w-3 h-3" /> {weather.windSpeedKmh} km/h
                </span>
                <span>·</span>
                <span>Chuva: {weather.precipitationMm} mm</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/*Expandable Layers Popover*/}
      {showLayerDrawer && (
        <div className="absolute top-16 left-3 z-30 w-72 p-4 rounded-2xl bg-slate-900/95 border border-slate-700 text-slate-100 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Camadas do Mapa
            </h3>
            <button
              type="button"
              onClick={() => setShowLayerDrawer(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {[
              {
                key: 'restaurantHeatmap' as const,
                label: 'Densidade de Restaurantes',
                sub: 'Zonas quentes de pedidos',
              },
              {
                key: 'personalHeatmap' as const,
                label: 'Heatmap Minhas Entregas',
                sub: 'Mancha térmica pessoal',
              },
              {
                key: 'myPoints' as const,
                label: 'Meus Pontos de Entrega',
                sub: 'Pinos com valor em R$',
              },
              {
                key: 'bikeLanes' as const,
                label: 'Malha Cicloviária (Bike)',
                sub: 'Ciclovias e ciclofaixas',
              },
              {
                key: 'traffic' as const,
                label: 'Trânsito em Tempo Real',
                sub: 'Fluxo nas vias urbanas',
              },
              {
                key: 'weatherOverlay' as const,
                label: 'Radar de Clima & Vento',
                sub: 'Condições para pedalar',
              },
            ].map((item) => {
              const active = layers[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleLayer(item.key)}
                  className={`w-full min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center justify-between transition-colors ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/60 text-white'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="text-[11px] text-slate-400">{item.sub}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                      active
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {active ? 'Ativo' : 'Off'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Restaurant Demand Filter Popover */}
      {showRestaurantFilterDrawer && (
        <div className="absolute top-16 left-3 z-30 w-80 p-4 rounded-2xl bg-slate-900/95 border border-slate-700 text-slate-100 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              Filtros do Heatmap de Demanda
            </h3>
            <button
              type="button"
              onClick={() => setShowRestaurantFilterDrawer(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Tipo de Comida
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {CUISINE_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      onUpdateRestaurantFilters({ cuisineType: c.value })
                    }
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left transition-colors whitespace-nowrap truncate ${
                      restaurantFilters.cuisineType === c.value
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Avaliação Mínima
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 3.5, 4.0, 4.5].map((ratingVal) => (
                  <button
                    key={ratingVal}
                    type="button"
                    onClick={() =>
                      onUpdateRestaurantFilters({ minRating: ratingVal })
                    }
                    className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-mono tabular-nums border flex items-center justify-center gap-1 ${
                      restaurantFilters.minRating === ratingVal
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Star className="w-3 h-3" />
                    {ratingVal === 0 ? 'Todas' : `${ratingVal}+`}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">
                Apenas abertos agora
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateRestaurantFilters({
                    openNow: !restaurantFilters.openNow,
                  })
                }
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  restaurantFilters.openNow
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {restaurantFilters.openNow ? 'Sim (Abertos)' : 'Mostrar Todos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificação de Ponto de Alta Demanda + Análise por IA para Zona com Heatmap Alto */}
      {showHotspotNotification && clusterSuggestion && clusterSuggestion.suggestedRoute && (
        <div className="absolute bottom-20 left-3 right-16 z-30 p-3.5 rounded-2xl bg-slate-900/95 border border-amber-500/80 text-slate-100 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-400 flex flex-wrap items-center gap-1.5">
                  <span>
                    {clusterSuggestion.aiAnalysis
                      ? clusterSuggestion.aiAnalysis.headline
                      : 'Ponto de Alta Demanda Detectado'}
                  </span>
                  <span>·</span>
                  <span className="text-white truncate">
                    {clusterSuggestion.clusterName}
                  </span>
                  {clusterSuggestion.aiAnalysis && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono tabular-nums text-[10px]">
                      Score IA {clusterSuggestion.aiAnalysis.efficiencyScore100}/100
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 mt-0.5 truncate">
                  {clusterSuggestion.restaurantCount} restaurantes no heatmap (★{' '}
                  {clusterSuggestion.avgRating.toFixed(1)}) · Ref:{' '}
                  {clusterSuggestion.anchorRestaurantName}
                </p>

                {clusterSuggestion.aiAnalysis ? (
                  <div className="mt-1.5 space-y-1 text-[11px] text-slate-200 bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                    <p className="leading-snug">
                      {clusterSuggestion.aiAnalysis.reasoning}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-slate-400">
                      <span>
                        Dica Bike: {clusterSuggestion.aiAnalysis.pacingTip}
                      </span>
                      <span className="font-mono tabular-nums text-amber-300 font-semibold">
                        {clusterSuggestion.aiAnalysis.estimatedRoiLabel}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-300/90 mt-1">
                    {isAnalyzingAiRoute
                      ? 'Analisando por IA a melhor rota até o heatmap mais quente...'
                      : 'Rota calculada para o cluster de alta demanda.'}
                  </p>
                )}

                <div className="text-xs font-mono tabular-nums text-emerald-400 font-semibold mt-1.5">
                  Rota eficiente (Routes API):{' '}
                  {formatKm(clusterSuggestion.suggestedRoute.totalDistanceKm)} ·{' '}
                  {formatDurationCompact(
                    clusterSuggestion.suggestedRoute.totalDurationSeconds
                  )}{' '}
                  de bike
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDismissedClusterId(clusterSuggestion.id)}
              className="p-1 text-slate-400 hover:text-white shrink-0"
              title="Fechar sugestão"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAcceptClusterRoute}
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Traçar Rota no Google Maps (Bike)</span>
            </button>
            <button
              type="button"
              onClick={handleTriggerAiRouteAnalysis}
              disabled={isAnalyzingAiRoute}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
              title="Reanalisar zonas de heatmap por IA"
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${
                  isAnalyzingAiRoute ? 'animate-spin' : ''
                }`}
              />
              <span>IA</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissedClusterId(clusterSuggestion.id)}
              className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold whitespace-nowrap"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {/* Planned Route Banner if active */}
      {plannedRoute && !showHotspotNotification && (
        <div className="absolute bottom-20 left-3 right-16 z-20 p-3 rounded-2xl bg-blue-950/95 border border-blue-500/70 text-blue-100 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-blue-400" />
              <span>Rota Eficiente Ativa (Bike)</span>
            </div>
            <div className="font-mono tabular-nums text-blue-200 mt-0.5">
              {formatKm(plannedRoute.totalDistanceKm)} ·{' '}
              {formatDuration(plannedRoute.totalDurationSeconds)} estimados
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenPlannedRouteInGoogleMaps}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir no Google Maps</span>
            </button>
            <button
              type="button"
              onClick={onClearPlannedRoute}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-xs font-semibold text-white whitespace-nowrap"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Replay Controller HUD if a past delivery is being replayed */}
      {replayDelivery && (
        <div className="absolute bottom-4 left-3 right-3 z-30 p-4 rounded-2xl bg-slate-900/95 border border-amber-500/80 text-slate-100 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Replay de Trajeto · {replayDelivery.app}
              </span>
              <p className="text-xs text-slate-300 font-mono tabular-nums">
                {new Date(replayDelivery.date).toLocaleString('pt-BR')} ·{' '}
                {formatKm(replayDelivery.distanceKm)} ·{' '}
                {formatCurrency(
                  replayDelivery.baseValue + replayDelivery.tipValue
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseReplay}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1"
            >
              <X className="w-4 h-4" /> Fechar
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (replayIndex >= replayDelivery.routePath.length - 1) {
                  setReplayIndex(0);
                  setIsReplayPlaying(true);
                } else {
                  setIsReplayPlaying((p) => !p);
                }
              }}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow"
              title={isReplayPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isReplayPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setReplayIndex(0);
                setIsReplayPlaying(true);
              }}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
              title="Reiniciar Replay"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(0, replayDelivery.routePath.length - 1)}
              value={replayIndex}
              onChange={(e) => {
                setIsReplayPlaying(false);
                setReplayIndex(Number(e.target.value));
              }}
              className="flex-1 accent-amber-500 cursor-pointer"
            />

            <button
              type="button"
              onClick={() =>
                setReplaySpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))
              }
              className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-amber-400"
            >
              {replaySpeed}x
            </button>
          </div>
        </div>
      )}

      {/* Right Floating GPS Recenter Button */}
      <button
        type="button"
        onClick={handleRecenter}
        title="Centralizar na minha localização GPS"
        className={`absolute bottom-5 right-3 z-20 min-h-[48px] min-w-[48px] rounded-2xl border shadow-xl flex items-center justify-center transition-colors ${
          followUser
            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
            : 'bg-slate-900/95 text-slate-100 border-slate-700 hover:bg-slate-800'
        }`}
      >
        <LocateFixed className="w-5 h-5" />
      </button>
    </div>
  );
};
