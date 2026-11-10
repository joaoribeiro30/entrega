export type DeliveryAppName = 'iFood' | 'Uber Eats' | 'Rappi' | 'Outro';

export type DayPeriod = 'manha' | 'almoco' | 'tarde' | 'jantar' | 'madrugada';

export interface RoutePoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number | null;
}

export interface DeliveryRecord {
  id: string;
  date: string; // ISO string
  periodOfDay: DayPeriod;
  app: DeliveryAppName;
  baseValue: number;
  tipValue: number;
  distanceKm: number;
  durationSeconds: number;
  zoneName: string;
  notes: string;
  isManual: boolean;
  routePath: RoutePoint[];
}

export interface CourierSettings {
  dailyEarningsGoal: number;
  dailyKmGoal: number;
  costPerKm: number; // Custo operacional da bike por km (R$/km)
  theme: 'dark' | 'light';
  soundAlertsEnabled: boolean;
}

export interface MapLayersState {
  restaurantHeatmap: boolean;
  personalHeatmap: boolean;
  myPoints: boolean;
  traffic: boolean;
  bikeLanes: boolean;
  weatherOverlay: boolean;
}

export type CuisineCategory =
  | 'all'
  | 'fast_food'
  | 'pizza'
  | 'japanese'
  | 'brazilian'
  | 'bakery';

export interface RestaurantFilterState {
  minRating: number;
  openNow: boolean;
  cuisineType: CuisineCategory;
}

export interface DeliveryFilterState {
  periodRange: 'today' | 'week' | 'month' | 'all';
  app: 'all' | DeliveryAppName;
  minValue: number;
  dayPeriod: 'all' | DayPeriod;
}

export interface RestaurantPoint {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  userRatingCount: number;
  isOpen: boolean;
  cuisineType: CuisineCategory;
  cuisineLabel: string;
  weight: number;
}

export interface WeatherData {
  temperatureC: number;
  windSpeedKmh: number;
  precipitationMm: number;
  weatherCode: number;
  conditionLabel: string;
  isBikeAlert: boolean;
  updatedAt: string;
}

export interface RouteStop {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface ComputedMultiRoute {
  totalDistanceKm: number;
  totalDurationSeconds: number;
  encodedPolylines: string[];
  decodedPaths: Array<{ lat: number; lng: number }[]>;
  legs: Array<{
    startAddress: string;
    endAddress: string;
    distanceKm: number;
    durationSeconds: number;
  }>;
}

export interface AiHotspotRouteAnalysis {
  selectedClusterId: string;
  headline: string;
  reasoning: string;
  pacingTip: string;
  estimatedRoiLabel: string;
  efficiencyScore100: number;
}

export interface RestaurantClusterSuggestion {
  id: string;
  clusterName: string;
  anchorRestaurantName: string;
  center: { lat: number; lng: number };
  restaurantCount: number;
  avgRating: number;
  totalDemandScore: number;
  distanceFromCourierKm: number;
  isCourierInsideHotspot: boolean;
  topRestaurants: string[];
  suggestedRoute: ComputedMultiRoute | null;
  aiAnalysis?: AiHotspotRouteAnalysis | null;
}

