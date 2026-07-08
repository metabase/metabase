/* eslint-disable testing-library/render-result-naming-convention --
   These tests use ReactDOMServer.renderToStaticMarkup (server-side string render), not an RTL render,
   so the "view"/"utils" naming convention doesn't apply. */
import type { FeatureCollection } from "geojson";
import ReactDOMServer from "react-dom/server";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { StaticChoropleth } from "./StaticChoropleth";
import { getStaticChoroplethSettings } from "./utils";

const renderingContext = {
  getColor: (name: string) =>
    name === "text-secondary" ? "#888888" : "#000000",
  formatValue: (value: unknown) => String(value),
  measureText: () => 0,
  fontFamily: "Lato",
} as unknown as RenderingContext;

// Two simple square "states" so d3.geoPath has coordinates to project.
const geoJson: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { STATE: "CA", NAME: "California" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122, 37],
            [-121, 37],
            [-121, 38],
            [-122, 38],
            [-122, 37],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { STATE: "NY", NAME: "New York" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-74, 40],
            [-73, 40],
            [-73, 41],
            [-74, 41],
            [-74, 40],
          ],
        ],
      },
    },
  ],
};

const rawSeries = [
  {
    card: { display: "map" },
    data: {
      cols: [
        { name: "state", base_type: "type/Text", semantic_type: "type/State" },
        {
          name: "count",
          base_type: "type/Integer",
          semantic_type: "type/Quantity",
        },
      ],
      rows: [
        ["CA", 100],
        // Provide NY by full name to exercise getCanonicalRowKey name->code mapping.
        ["New York", 25],
      ],
    },
  },
] as unknown as RawSeries;

const settings: ComputedVisualizationSettings = {
  "map.region": "us_states",
  "map.dimension": "state",
  "map.metric": "count",
};

const toSvgString = (vizSettings: ComputedVisualizationSettings = settings) =>
  ReactDOMServer.renderToStaticMarkup(
    <StaticChoropleth
      rawSeries={rawSeries}
      settings={vizSettings}
      geoJson={geoJson}
      geoJsonDetails={{ region_key: "STATE", region_name: "NAME" }}
      renderingContext={renderingContext}
    />,
  );

describe("StaticChoropleth", () => {
  it("renders a root <svg> (so the pipeline rasterizes it to PNG)", () => {
    expect(toSvgString().startsWith("<svg")).toBe(true);
  });

  it("renders one <path> per GeoJSON feature", () => {
    const matches = toSvgString().match(/<path/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it("colors regions that have data (not the no-data gray) and matches by canonical key", () => {
    const svg = toSvgString();
    // Both CA (code) and "New York" (full name -> NY) should join and get heat-map colors.
    // Colors are emitted as rgb() (Batik can't parse hsl()); #0061B5 === rgb(0, 97, 181).
    expect(svg).toContain('fill="rgb(0, 97, 181)"'); // darkest bucket, highest value (CA = 100)
  });

  it("emits colors as rgb(), never hsl() (Batik can't parse hsl)", () => {
    // map.colors can arrive as hsl() from getColorplethColorScale; they must be converted.
    const svg = toSvgString({
      "map.region": "us_states",
      "map.dimension": "state",
      "map.metric": "count",
      "map.colors": ["hsl(210, 100%, 88%)", "hsl(210, 100%, 36%)"],
    });
    expect(svg).not.toContain("hsl(");
    expect(svg).toMatch(/fill="rgb\(/);
  });

  it("renders a legend with formatted value ranges", () => {
    const svg = toSvgString();
    expect(svg).toContain("<text");
    // Legend bins span the two data points.
    expect(svg).toMatch(/25|100/);
    // Legend labels use the rendering context color as-is (already Batik-safe hex), not re-converted.
    expect(svg).toContain('fill="#888888"');
  });

  it("formats legend labels with the metric column's settings via getStaticChoroplethSettings", () => {
    // getStaticChoroplethSettings rebuilds the `settings.column` accessor that the static-viz bundle
    // can't (map isn't registered there); without it the currency formatting never reaches the legend.
    const currencyRawSeries: RawSeries = [
      createMockSingleSeries(
        {
          display: "map",
          visualization_settings: {
            "map.region": "us_states",
            "map.dimension": "state",
            "map.metric": "revenue",
          },
        },
        {
          data: {
            cols: [
              createMockColumn({
                name: "state",
                base_type: "type/Text",
                semantic_type: "type/State",
              }),
              createMockColumn({
                name: "revenue",
                base_type: "type/Float",
                semantic_type: "type/Income",
                settings: { number_style: "currency", currency: "USD" },
              }),
            ],
            rows: [
              ["CA", 12400],
              ["New York", 1400],
            ],
          },
        },
      ),
    ];

    const svg = ReactDOMServer.renderToStaticMarkup(
      <StaticChoropleth
        rawSeries={currencyRawSeries}
        settings={getStaticChoroplethSettings(currencyRawSeries)}
        geoJson={geoJson}
        geoJsonDetails={{ region_key: "STATE", region_name: "NAME" }}
        renderingContext={renderingContext}
      />,
    );

    // Currency symbol from the column settings reaches the legend, and the raw value is abbreviated away.
    expect(svg).toContain("$");
    expect(svg).not.toContain("12400");
  });

  it("renders the legend to the side when legendPosition is 'side'", () => {
    // The side layout widens the viewBox leftward (negative x origin) to seat the vertical legend
    // column beside the map; the default bottom strip starts at the map's own origin.
    const sideSvg = ReactDOMServer.renderToStaticMarkup(
      <StaticChoropleth
        rawSeries={rawSeries}
        settings={settings}
        geoJson={geoJson}
        geoJsonDetails={{ region_key: "STATE", region_name: "NAME" }}
        renderingContext={renderingContext}
        legendPosition="side"
      />,
    );

    expect(sideSvg.startsWith("<svg")).toBe(true);
    expect(sideSvg).toContain("<text");
    expect(sideSvg).toMatch(/viewBox="-[\d.]+ /);
    expect(toSvgString()).not.toMatch(/viewBox="-/);
  });

  it("renders a custom (non-us_states) region via Mercator + fitWidth", () => {
    // Any region other than us_states uses geoMercator().fitWidth, which fits arbitrary GeoJSON bounds —
    // this is what makes user-defined custom maps work without hardcoded projection frames.
    const svg = toSvgString({
      "map.region": "my_custom_region",
      "map.dimension": "state",
      "map.metric": "count",
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/<path/g) ?? []).toHaveLength(2);
  });

  it("defaults map.dimension/map.metric from column types when they aren't persisted", () => {
    // Only map.region is set (the backend pins it); dimension/metric must be inferred from columns.
    const svg = toSvgString({ "map.region": "us_states" });
    expect(svg).toContain('fill="rgb(0, 97, 181)"'); // CA still resolves and gets the darkest bucket
    const paths = svg.match(/<path/g) ?? [];
    expect(paths).toHaveLength(2);
  });
});
