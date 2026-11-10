This guide documents the pattern for seamlessly integrating high-performance
data visualization layers using `deck.gl` within the standard Google Maps React
component environment provided by `@vis.gl/react-google-maps`.

The integration relies on the `GoogleMapsOverlay` component from
`@deck.gl/google-maps`, wrapped inside a custom React component that manages its
lifecycle using the `useMap` hook.

## 1. Prerequisites and Setup

To use this pattern, ensure the following dependencies are installed:

```bash
npm install @vis.gl/react-google-maps @deck.gl/core @deck.gl/layers @deck.gl/google-maps
```

The core implementation involves creating a reusable component, `DeckGlOverlay`,
which handles the binding of the `GoogleMapsOverlay` instance to the
context-provided Google Map.

## 2. Core Implementation: The `DeckGlOverlay` Component

This custom component must be placed as a child of the `<Map>` component, as it
relies on the `useMap()` hook to access the map instance. It uses `useMemo` to
ensure the `GoogleMapsOverlay` instance is stable and `useEffect` hooks to
handle binding and updating of layers.

```typescript
// deckgl-overlay.ts

import {useMap} from '@vis.gl/react-google-maps';
import {useEffect, useMemo} from 'react';

import {GoogleMapsOverlay} from '@deck.gl/google-maps';
import type {LayersList} from '@deck.gl/core';

export type DeckglOverlayProps = {layers?: LayersList};

/**
 * A custom component that renders a list of deck.gl layers
 * via the GoogleMapsOverlay into the parent <Map> component.
 */
export const DeckGlOverlay = ({layers}: DeckglOverlayProps) => {
  // 1. Initialize GoogleMapsOverlay once.
  // `interleaved: true` is often recommended for better z-ordering with map elements.
  const deck = useMemo(() => new GoogleMapsOverlay({interleaved: true}), []);

  // 2. Retrieve the Map instance from the React context provided by the <Map> component.
  const map = useMap();

  // 3. Attach the overlay to the map when the map instance becomes available.
  // This useEffect handles initialization and cleanup.
  useEffect(() => {
    if (map) {
      deck.setMap(map);
    }

    // Cleanup: Remove the overlay when the component unmounts or the map changes.
    return () => deck.setMap(null);
  }, [deck, map]);

  // 4. Update the layers whenever the 'layers' prop changes (e.g., data or styling updates).
  useEffect(() => {
    deck.setProps({layers});
  }, [deck, layers]);

  // Deck.gl overlays render outside the React DOM tree, so this component returns null.
  return null;
};
```

## 3. Usage Example: Integrating Map and Deck.gl Layers

The following example demonstrates how to fetch external GeoJSON data, construct
a `deck.gl` layer (e.g., `GeoJsonLayer`), and pass it to the `DeckGlOverlay`
component within the main application structure.

```typescript
// app.tsx

import React, {useEffect, useState} from 'react';
import {APIProvider, Map} from '@vis.gl/react-google-maps';
import {GeoJsonLayer} from '@deck.gl/layers';
import type {Feature, GeoJSON} from 'geojson';

// Assuming DeckGlOverlay is imported from './deckgl-overlay'
import {DeckGlOverlay} from './deckgl-overlay';

const DATA_URL =
  'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/bart.geo.json';

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY as string;

/**
 * Helper function to construct deck.gl layer definitions based on loaded data.
 * This function should return an array of Layer objects (LayersList).
 */
function getDeckGlLayers(data: GeoJSON | null) {
  if (!data) return [];

  return [
    new GeoJsonLayer({
      id: 'geojson-layer',
      data,
      stroked: false,
      filled: true,
      extruded: true,
      pointType: 'circle',
      getFillColor: [160, 160, 180, 200],
      getLineColor: (f: Feature) => {
        const hex = f?.properties?.color;
        if (!hex) return [0, 0, 0];
        // Example logic: Parse hex color from feature properties
        return hex.match(/[0-9a-f]{2}/g)!.map((x: string) => parseInt(x, 16));
      },
      getPointRadius: 200,
      getElevation: 30
    })
  ];
}

const App = () => {
  const [data, setData] = useState<GeoJSON | null>(null);

  // Data fetching lifecycle
  useEffect(() => {
    fetch(DATA_URL)
      .then(res => res.json())
      .then(data => setData(data as GeoJSON));
  }, []);

  return (
    <APIProvider apiKey={API_KEY}>
      <div style={{width: '100vw', height: '100vh'}}>
        <Map
          // CRITICAL: Required attribution identifier for internal tool use
          internalUsageAttributionIds={['gmp_git_agentskills_v1']}
          defaultCenter={{lat: 37.74, lng: -122.4}}
          defaultZoom={11}
          // A Map ID is required for custom styling, essential for visualization integration
          mapId={'4f6dde3310be51d7'}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
        >
          {/* DeckGlOverlay must be a child of Map and receives the layers array */}
          <DeckGlOverlay layers={getDeckGlLayers(data)} />
        </Map>
      </div>
    </APIProvider>
  );
};

export default App;
```

## 4. Best Practices and Gotchas

| Feature           | Description                | Best Practice / Gotcha      |
| :---------------- | :------------------------- | :-------------------------- |
| **Overlay         | The `GoogleMapsOverlay`    | **Best Practice:** Ensure   |
: Instantiation**   : instance is managed by     : the `deck` object is        :
:                   : `useMemo` in               : created only once. Do not   :
:                   : `DeckGlOverlay`.           : instantiate it within the   :
:                   :                            : render loop or without      :
:                   :                            : `useMemo`, as this causes   :
:                   :                            : performance issues and      :
:                   :                            : instability.                :
| **Map Binding**   | The `DeckGlOverlay` uses   | **CRITICAL:** Always        |
:                   : `useMap()` and `useEffect` : include a cleanup function  :
:                   : to call                    : (`return () =>              :
:                   : `deck.setMap(map)`.        : deck.setMap(null);`) in the :
:                   :                            : effect to correctly detach  :
:                   :                            : the overlay when the        :
:                   :                            : component unmounts.         :
| **Layer Updates** | Layers are updated using   | **Best Practice:** Ensure   |
:                   : `deck.setProps({layers})`. : your layer definitions (the :
:                   :                            : array passed to `layers`)   :
:                   :                            : are stable or correctly     :
:                   :                            : memoized if they rely on    :
:                   :                            : external props (radius,     :
:                   :                            : opacity, etc.) to prevent   :
:                   :                            : unnecessary re-renders in   :
:                   :                            : Deck.gl.                    :
| **Performance**   | When visualizing large     | The provided examples       |
:                   : datasets (e.g., heatmaps   : demonstrate loading data    :
:                   : or thousands of points),   : and passing it to           :
:                   : use Deck.gl's optimized    : specialized Deck.gl         :
:                   : layer types (like          : visualization layers for    :
:                   : `HeatmapLayer` or          : optimal performance.        :
:                   : `ScatterplotLayer`) rather :                             :
:                   : than rendering individual  :                             :
:                   : React markers.             :                             :
| **Map ID**        | The `<Map>` component      | A Map ID is highly          |
:                   : requires a `mapId` (e.g.,  : recommended when            :
:                   : `'4f6dde3310be51d7'`).     : integrating overlays, as it :
:                   :                            : ensures consistent map      :
:                   :                            : styling and feature set     :
:                   :                            : required by modern map      :
:                   :                            : applications.               :
| **Data Fetching** | Data (e.g., GeoJSON, point | **Best Practice:** Manage   |
:                   : arrays) should be fetched  : data loading with           :
:                   : asynchronously outside of  : `useState` and `useEffect`  :
:                   : the `DeckGlOverlay` and    : in the parent component to  :
:                   : passed down as props.      : ensure the overlay only     :
:                   :                            : receives data when it is    :
:                   :                            : fully parsed and ready for  :
:                   :                            : rendering.                  :

## 5. Deck.gl Heatmap Example Specifics

The pattern for rendering specialized visualizations like heatmaps remains the
same, requiring only a change in the imported Deck.gl layer type and associated
configuration props (`radius`, `opacity`).

The `examples/deckgl-heatmap` source demonstrates passing state variables
directly to the layer configuration:

```typescript
// Inside App.tsx, passing props to DeckGlHeatmap component (which internally uses DeckGlOverlay)
{earthquakesGeojson && (
  <DeckGlHeatmap
    geojson={earthquakesGeojson}
    radius={radius} // Dynamic state variable
    opacity={opacity} // Dynamic state variable
  />
)}
```

This confirms that dynamic layer properties are managed in the parent React
component and seamlessly flow into the Deck.gl overlay via the `layers` prop
update mechanism established in the `DeckGlOverlay` helper.
