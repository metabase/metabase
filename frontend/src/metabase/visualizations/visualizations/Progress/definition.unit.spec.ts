import type {
  DatasetData,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
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
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

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
    it("accepts a goal reference that is still resolving", () => {
      expect(() => checkRenderable(createSeries(), SETTINGS)).not.toThrow();
    });

    it("accepts a resolved goal reference", () => {
      const series = createSeries({
        referenced_entities: createMockReferencedEntitiesResults({
          value: 250,
        }),
      });

      expect(() => checkRenderable(series, SETTINGS)).not.toThrow();
    });

    it("keeps rendering a column of this question whose value is empty", () => {
      expect(() =>
        checkRenderable(createSeries({ rows: [[50, null]] }), {
          "progress.goal": "target",
        }),
      ).not.toThrow();
    });

    it("refuses to render when the referenced query failed", () => {
      const series = createSeries({
        referenced_entities: createMockFailedReferencedEntitiesResults(),
      });

      expect(() => checkRenderable(series, SETTINGS)).toThrow(GOAL_ERROR);
    });

    it("refuses to render when the referenced value is not a number", () => {
      const series = createSeries({
        referenced_entities: createMockReferencedEntitiesResults({
          value: "x",
        }),
      });

      expect(() => checkRenderable(series, SETTINGS)).toThrow(GOAL_ERROR);
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
