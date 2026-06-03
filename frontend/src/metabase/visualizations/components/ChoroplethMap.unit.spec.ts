import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import {
  getLegendTitles,
  getMapUrl,
  getSelectedFeatureKeyFromClicked,
} from "metabase/visualizations/components/ChoroplethMap";
import type { ColumnSettings } from "metabase/visualizations/types";
import type { ClickObject } from "metabase-lib";
import { createMockColumn } from "metabase-types/api/mocks";

const currencyColumnSettings: ColumnSettings = {
  column: { base_type: "type/Float" },
  number_style: "currency",
  currency: "USD",
  currency_style: "symbol",
};

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

describe("getSelectedFeatureKeyFromClicked", () => {
  const stateColumn = createMockColumn({
    name: "STATE",
    display_name: "State",
  });
  const rows = [
    ["Texas", 100],
    ["California", 200],
  ];

  const setup = (clicked: ClickObject) =>
    getSelectedFeatureKeyFromClicked({
      clicked,
      cols: [
        stateColumn,
        createMockColumn({ name: "COUNT", display_name: "Count" }),
      ],
      rows,
      dimensionName: "STATE",
      region: "us_states",
    });

  it("uses the clicked map dimension when the full row does not match", () => {
    expect(
      setup({
        dimensions: [{ column: stateColumn, value: "Texas" }],
        origin: {
          cols: [
            stateColumn,
            createMockColumn({ name: "OTHER", display_name: "Other" }),
          ],
          row: ["Texas", "value from a different result shape"],
        },
      }),
    ).toBe("tx");
  });

  it("falls back to the matching origin column", () => {
    expect(
      setup({
        origin: {
          cols: [
            createMockColumn({ name: "OTHER", display_name: "Other" }),
            createMockColumn({
              name: "STATE_FROM_TARGET",
              display_name: "State",
            }),
          ],
          row: ["ignored", "California"],
        },
      }),
    ).toBe("ca");
  });
});
