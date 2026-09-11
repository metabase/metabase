import type { Card, RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";
import { createMockTokenFeatures } from "metabase-types/api/mocks/settings";

import type { RenderChartOptions } from "./types";

import { renderChart } from "./index";

const INSTANCE_ACCENT_3 = "#ABCDEF";

const makeRawSeries = (colorName?: string): RawSeries<Card> => [
  {
    card: createMockCard({
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["Category"],
        "graph.metrics": ["Amount"],
        series_settings: {
          Amount: { color: "#EF8C8C", color_name: colorName },
        },
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "Category",
          display_name: "Category",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "Amount",
          display_name: "Amount",
          base_type: "type/Integer",
          semantic_type: "type/Number",
        }),
      ],
      rows: [
        ["Soy", 20],
        ["Rye", 10],
      ],
    }),
  },
];

const makeOptions = (): RenderChartOptions => ({
  tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
  applicationColors: { accent3: INSTANCE_ACCENT_3 },
  customFormatting: {},
  startOfWeek: null,
});

const getChartSvg = (colorName?: string) =>
  renderChart({
    rawSeries: makeRawSeries(colorName),
    dashcardSettings: {},
    options: makeOptions(),
  }).content;

describe("static viz chart colors", () => {
  it("paints a series recorded as a palette color with the instance's color", () => {
    expect(getChartSvg("accent3")).toContain(INSTANCE_ACCENT_3);
  });

  it("keeps the stored color of a series with no recorded palette color", () => {
    const svg = getChartSvg(undefined);

    expect(svg).toContain("#EF8C8C");
    expect(svg).not.toContain(INSTANCE_ACCENT_3);
  });
});
