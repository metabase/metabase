import fetchMock from "fetch-mock";

import { renderWithProviders, waitFor } from "__support__/ui";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import MetabaseSettings from "metabase/utils/settings";
import {
  ChoroplethMap,
  getMapUrl,
} from "metabase/visualizations/components/ChoroplethMap";
import { buildFeatureClickObject } from "metabase/visualizations/components/ChoroplethMap.utils";
import { createMockVisualizationProps } from "metabase/visualizations/types/mocks";
import { getLegendTitles } from "metabase/viz-core";
import type { ColumnSettings, RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

const currencyColumnSettings: ColumnSettings = {
  column: { base_type: "type/Float" },
  number_style: "currency",
  currency: "USD",
  currency_style: "symbol",
};

describe("buildFeatureClickObject", () => {
  const stateColumn = createMockColumn({
    name: "STATE",
    display_name: "State",
    source: "breakout",
    semantic_type: "type/State",
  });
  const countColumn = createMockColumn({
    name: "count",
    display_name: "Count",
    source: "aggregation",
  });
  const clickContext = {
    cols: [stateColumn, countColumn],
    dimensionIndex: 0,
    metricIndex: 1,
    settings: { "map.region": "us_states" },
    getFeatureName: () => "California",
    getFeatureKey: () => "CA",
    cardId: 42,
  };

  it("includes cardId and the row dimension for populated regions", () => {
    expect(
      buildFeatureClickObject([["CA", 10]], null, clickContext),
    ).toMatchObject({
      cardId: 42,
      value: 10,
      column: countColumn,
      dimensions: [{ value: "CA", column: stateColumn }],
    });
  });

  it("sums the metric of all rows mapped to the same region (metabase#69659)", () => {
    const idColumn = createMockColumn({
      name: "ID",
      display_name: "ID",
      source: "breakout",
    });
    const clickObject = buildFeatureClickObject(
      [
        ["CA", 1, 10],
        ["CA", 2, 20],
        ["ca", 3, 5],
      ],
      null,
      {
        ...clickContext,
        cols: [stateColumn, idColumn, countColumn],
        metricIndex: 2,
      },
    );

    expect(clickObject).toMatchObject({
      cardId: 42,
      value: 35,
      column: countColumn,
      dimensions: [{ value: "CA", column: stateColumn }],
      data: [
        { key: "State", value: "CA", col: stateColumn },
        { key: "Count", value: 35, col: countColumn },
      ],
    });
  });

  it("returns an empty-dimension click object for empty regions", () => {
    expect(
      buildFeatureClickObject(
        undefined,
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: null,
        },
        clickContext,
      ),
    ).toMatchObject({
      cardId: 42,
      dimensions: [],
      data: [{ col: stateColumn, value: "CA" }],
    });
  });
});

describe("ChoroplethMap", () => {
  const WORLD_GEOJSON_URL = "app/assets/geojson/world.json";

  const setup = (rows: RowValue[][]) => {
    jest.spyOn(MetabaseSettings, "get").mockImplementation((key: string) => {
      if (key === "custom-geojson") {
        return {
          world_countries: {
            name: "World",
            url: WORLD_GEOJSON_URL,
            region_key: "ISO_A2",
            region_name: "NAME",
            builtin: true,
          },
        };
      }
      return null;
    });
    fetchMock.get(`end:${WORLD_GEOJSON_URL}`, {
      type: "FeatureCollection",
      features: [],
    });

    const onRender = jest.fn();
    const series = [
      createMockSingleSeries(
        {},
        {
          data: createMockDatasetData({
            cols: [
              createMockColumn({
                name: "COUNTRY",
                display_name: "Country",
                semantic_type: "type/Country",
              }),
              createMockColumn({ name: "ID", display_name: "ID" }),
              createMockColumn({ name: "count", display_name: "Count" }),
            ],
            rows,
          }),
        },
      ),
    ];
    const props = createMockVisualizationProps({
      series,
      rawSeries: series,
      data: series[0].data,
      card: series[0].card,
      settings: {
        "map.type": "region",
        "map.region": "world_countries",
        "map.dimension": "COUNTRY",
        "map.metric": "count",
      },
      onRender,
    });

    renderWithProviders(<ChoroplethMap {...props} />);

    return { onRender };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should report the unaggregated data warning when several rows map to the same region (metabase#69659)", async () => {
    const { onRender } = setup([
      ["DZ", 1, 1],
      ["DZ", 2, 1],
      ["US", 3, 1],
    ]);

    await waitFor(() => {
      expect(onRender).toHaveBeenCalledWith({
        warnings: [
          '"Country" is an unaggregated field: if it has more than one row with the same value, their measure values will be summed.',
        ],
      });
    });
  });

  it("should not report the unaggregated data warning when regions are unique", async () => {
    const { onRender } = setup([
      ["DZ", 1, 1],
      ["US", 3, 1],
    ]);

    await waitFor(() => {
      expect(onRender).toHaveBeenCalledWith({ warnings: [] });
    });
    expect(onRender).not.toHaveBeenCalledWith({
      warnings: expect.arrayContaining([
        expect.stringContaining("unaggregated"),
      ]),
    });
  });
});

describe("getLegendTitles", () => {
  it("should not format short values compactly", () => {
    const groups = [
      [1.12, 1.12, 1.25],
      [1.32, 1.48],
      [9, 12, 13],
    ];

    const titles = getLegendTitles(groups, currencyColumnSettings);

    expect(titles).toEqual(["$1.12 - $1.25", "$1.32 - $1.48", "$9.00 +"]);
  });

  it("should format long values compactly", () => {
    const groups = [
      [1000.12, 1100.12, 1200.25],
      [2000.32, 2200, 2500.48],
      [11000, 12000, 13000],
    ];

    const titles = getLegendTitles(groups, currencyColumnSettings);

    expect(titles).toEqual(["$1.0k - $1.2k", "$2.0k - $2.5k", "$11.0k +"]);
  });

  describe("getMapUrl", () => {
    describe("when using the embedding SDK", () => {
      beforeEach(async () => {
        await mockIsEmbeddingSdk();
      });

      const setup = ({
        sdkMetabaseInstanceUrl,
      }: {
        sdkMetabaseInstanceUrl: string;
      }) => {
        return getMapUrl(
          { builtin: true, url: "api/geojson/world.json" },
          { sdkMetabaseInstanceUrl },
        );
      };

      it("should handle relative paths for `sdkMetabaseInstanceUrl`", () => {
        const url = setup({ sdkMetabaseInstanceUrl: "/proxy-to-mb" });

        expect(url).toBe("http://localhost/proxy-to-mb/api/geojson/world.json");
      });

      it("should handle root absolute paths for `sdkMetabaseInstanceUrl`", () => {
        const url = setup({
          sdkMetabaseInstanceUrl: "http://mb-instance.example.com",
        });

        expect(url).toBe(
          "http://mb-instance.example.com/api/geojson/world.json",
        );
      });

      it("should handle absolute paths (with subpaths) for `sdkMetabaseInstanceUrl`", () => {
        const url = setup({
          sdkMetabaseInstanceUrl: "http://mb-instance.example.com/sub-path",
        });

        expect(url).toBe(
          "http://mb-instance.example.com/sub-path/api/geojson/world.json",
        );
      });

      it("supports custom GeoJSON maps", () => {
        const url = getMapUrl(
          { builtin: false },
          {
            sdkMetabaseInstanceUrl: "http://mb-instance.example.com",
            settings: {
              "map.region": "f3b71a29-5e4b-4d6c-8a1f-9c0e2d3a4b5c",
            },
          },
        );

        expect(url).toBe(
          "http://mb-instance.example.com/api/geojson/f3b71a29-5e4b-4d6c-8a1f-9c0e2d3a4b5c",
        );
      });
    });
  });
});
