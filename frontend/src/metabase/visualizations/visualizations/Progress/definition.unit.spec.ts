import type {
  DatasetColumn,
  DatasetData,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { PROGRESS_CHART_DEFINITION } from "./definition";

const { checkRenderable } = PROGRESS_CHART_DEFINITION;

const COLS = [
  createMockColumn({ name: "count", base_type: "type/Integer" }),
  createMockColumn({ name: "target", base_type: "type/Integer" }),
];
const REFERENCED_GOAL = { type: "card", id: 9, column: "goal" } as const;
const SETTINGS: VisualizationSettings = { "progress.goal": REFERENCED_GOAL };

describe("PROGRESS_CHART_DEFINITION", () => {
  describe("progress.goal widget", () => {
    const setting = PROGRESS_CHART_DEFINITION.settings?.["progress.goal"];

    it("offers the columns of this question except the value", () => {
      const series = createSeries();

      expect(setting?.widget).toBe("goalValue");
      expect(
        setting?.getProps?.(
          series,
          { ...SETTINGS, "progress.value": "count" },
          jest.fn(),
          {},
          jest.fn(),
        ),
      ).toEqual({
        data: series[0].data,
        datasetQuery: series[0].card.dataset_query,
        excludedSelfColumn: "count",
        placeholder: "Enter goal value",
      });
    });

    it("formats the goal like the value it shows", () => {
      const props = setting?.getProps?.(
        createSeries(),
        {
          ...SETTINGS,
          "progress.value": "target",
          column: (column: DatasetColumn) => ({ prefix: `${column.name}:` }),
        },
        jest.fn(),
        {},
        jest.fn(),
      );

      expect(props?.formatOptions).toEqual({ prefix: "target:" });
    });

    it.each([
      ["a static value", 100],
      ["a numeric column of this question", "target"],
      ["a reference to another entity", REFERENCED_GOAL],
    ])("accepts %s", (_name, goal) => {
      expect(
        setting?.isValid?.(createSeries(), { "progress.goal": goal }),
      ).toBe(true);
    });

    it("rejects a column this question no longer has", () => {
      expect(
        setting?.isValid?.(createSeries(), { "progress.goal": "missing" }),
      ).toBe(false);
    });
  });

  describe("checkRenderable", () => {
    it("renders when the referenced query failed", () => {
      const series = createSeries({
        referenced_entities: createMockFailedReferencedEntitiesResults(),
      });

      expect(() => checkRenderable(series, SETTINGS)).not.toThrow();
    });
  });
});

function createSeries(data: Partial<DatasetData> = {}): RawSeries {
  return [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: SETTINGS }),
      {
        data: createMockDatasetData({ cols: COLS, rows: [[50, 80]], ...data }),
      },
    ),
  ];
}
