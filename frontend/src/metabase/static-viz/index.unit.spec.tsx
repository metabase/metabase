import type { RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";
import { createMockTokenFeatures } from "metabase-types/api/mocks/settings";

import type { RenderChartOptions } from "./types";

import { renderChart } from "./index";

const makeOptions = (): RenderChartOptions => ({
  tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
  applicationColors: { accent3: "#ABCDEF" },
  customFormatting: {},
  startOfWeek: null,
});

const remappedStackedRowSeries = (): RawSeries => [
  {
    card: createMockCard({
      display: "row",
      visualization_settings: {
        "graph.dimensions": ["team", "category_id"],
        "graph.metrics": ["sum"],
        "stackable.stack_type": "stacked",
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "category_id",
          display_name: "Category ID",
          base_type: "type/Integer",
          semantic_type: "type/Category",
          remapped_to: "Category label",
        }),
        createMockColumn({
          name: "team",
          display_name: "Team",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "sum",
          display_name: "Sum",
          base_type: "type/Float",
          semantic_type: "type/Number",
        }),
        createMockColumn({
          name: "Category label",
          display_name: "Category label",
          base_type: "type/Text",
          remapped_from: "category_id",
        }),
      ],
      rows: [
        [1, "Team A", 10, "Type A"],
        [1, "Team B", 20, "Type A"],
        [2, "Team C", 30, "Type B"],
        [2, "Team D", 40, "Type B"],
      ],
    }),
  },
];

describe("static viz remapped row charts", () => {
  it("renders a stacked row chart with remapped category labels", () => {
    const { type, content } = renderChart({
      rawSeries: remappedStackedRowSeries(),
      dashcardSettings: {},
      options: makeOptions(),
    });

    expect(type).toBe("svg");
    expect(content).toContain("Type A");
    expect(content).toContain("Type B");
    expect(content).toContain("Team A");
  });
});
