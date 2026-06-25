import type { FeatureCollection } from "geojson";

// Real built-in maps (via the `assets` alias) give recognizable Loki references and exercise the projection
// against real (Multi)Polygon geometry. Faithful because the component only ever receives parsed GeoJSON.
import usStatesGeoJson from "assets/geojson/us-states.json";
import worldCountriesGeoJson from "assets/geojson/world.json";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { getStaticChoroplethSettings } from "./utils";

// A user-defined custom region (non-us_states, non-default region_key): exercises the Mercator + fitWidth branch.
const customRegionGeoJson: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { ZONE: "north", LABEL: "North" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 10],
            [10, 10],
            [10, 5],
            [0, 5],
            [0, 10],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { ZONE: "south", LABEL: "South" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 5],
            [10, 5],
            [10, 0],
            [0, 0],
            [0, 5],
          ],
        ],
      },
    },
  ],
};

const stateCols = [
  { name: "state", base_type: "type/Text", semantic_type: "type/State" },
  { name: "count", base_type: "type/Integer", semantic_type: "type/Quantity" },
];

const makeRawSeries = (
  cols: unknown[],
  rows: unknown[][],
  visualizationSettings: Record<string, unknown> = {},
): RawSeries =>
  [
    {
      card: { display: "map", visualization_settings: visualizationSettings },
      data: { cols, rows },
    },
  ] as unknown as RawSeries;

const usStatesSettings: ComputedVisualizationSettings = {
  "map.region": "us_states",
  "map.dimension": "state",
  "map.metric": "count",
};

const worldSettings: ComputedVisualizationSettings = {
  "map.region": "world_countries",
  "map.dimension": "country",
  "map.metric": "count",
};

const customSettings: ComputedVisualizationSettings = {
  "map.region": "sales_zones",
  "map.dimension": "zone",
  "map.metric": "count",
};

export const usStates = {
  geoJson: usStatesGeoJson,
  geoJsonDetails: { region_key: "STATE", region_name: "NAME" },
  settings: usStatesSettings,
  // "New York" given by full name to exercise getCanonicalRowKey name -> code mapping.
  rawSeries: makeRawSeries(stateCols, [
    ["CA", 100],
    ["New York", 25],
  ]),
};

export const worldCountries = {
  geoJson: worldCountriesGeoJson,
  geoJsonDetails: { region_key: "ISO_A2", region_name: "NAME" },
  settings: worldSettings,
  rawSeries: makeRawSeries(
    [
      {
        name: "country",
        base_type: "type/Text",
        semantic_type: "type/Country",
      },
      {
        name: "count",
        base_type: "type/Integer",
        semantic_type: "type/Quantity",
      },
    ],
    [
      ["US", 4200],
      ["CA", 1700],
    ],
  ),
};

export const customRegion = {
  geoJson: customRegionGeoJson,
  geoJsonDetails: { region_key: "ZONE", region_name: "LABEL" },
  settings: customSettings,
  rawSeries: makeRawSeries(
    [
      { name: "zone", base_type: "type/Text" },
      {
        name: "count",
        base_type: "type/Integer",
        semantic_type: "type/Quantity",
      },
    ],
    [
      ["north", 8],
      ["south", 3],
    ],
  ),
};

// A currency metric with thousands-scale values: the legend abbreviates to "$1.4k"-style labels
// (matching the live dashboard) only when the metric column's formatting reaches getLegendTitles via
// getStaticChoroplethSettings — the behavior this story guards.
const revenueCols = [
  { name: "state", base_type: "type/Text", semantic_type: "type/State" },
  {
    name: "revenue",
    base_type: "type/Float",
    semantic_type: "type/Income",
    settings: {
      number_style: "currency",
      currency: "USD",
      currency_style: "symbol",
    },
  },
];

const revenueRawSeries = makeRawSeries(
  revenueCols,
  [
    ["CA", 108500],
    ["TX", 66000],
    ["NY", 44700],
    ["FL", 42600],
    ["IL", 30000],
    ["PA", 27200],
    ["OH", 16800],
    ["GA", 12400],
    ["WA", 1400],
  ],
  {
    "map.region": "us_states",
    "map.dimension": "state",
    "map.metric": "revenue",
  },
);

export const usStatesCurrency = {
  geoJson: usStatesGeoJson,
  geoJsonDetails: { region_key: "STATE", region_name: "NAME" },
  rawSeries: revenueRawSeries,
  settings: getStaticChoroplethSettings(revenueRawSeries),
};

// Same region as `usStates` but no rows join — exercises the all-gray, no-legend (no-data) branch.
export const noData = {
  geoJson: usStatesGeoJson,
  geoJsonDetails: { region_key: "STATE", region_name: "NAME" },
  settings: usStatesSettings,
  rawSeries: makeRawSeries(stateCols, []),
};
