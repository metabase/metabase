import type { FeatureCollection } from "geojson";

// Real built-in maps (via the `assets` alias) give recognizable Loki references and exercise the projection
// against real (Multi)Polygon geometry. Faithful because the component only ever receives parsed GeoJSON.
import usStatesGeoJson from "assets/geojson/us-states.json";
import worldCountriesGeoJson from "assets/geojson/world.json";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

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

const makeRawSeries = (cols: unknown[], rows: unknown[][]): RawSeries =>
  [
    {
      card: { display: "map" },
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

// Same region as `usStates` but no rows join — exercises the all-gray, no-legend (no-data) branch.
export const noData = {
  geoJson: usStatesGeoJson,
  geoJsonDetails: { region_key: "STATE", region_name: "NAME" },
  settings: usStatesSettings,
  rawSeries: makeRawSeries(stateCols, []),
};
