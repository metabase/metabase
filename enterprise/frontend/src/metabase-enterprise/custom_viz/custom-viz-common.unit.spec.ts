import { getSensibleDisplays } from "metabase/visualizations";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CustomVizDisplayType } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { registerMockCustomViz } from "./test-utils";

// `getSensibleDisplays` treats every display as sensible for a single row, so
// the sensibility checks below only mean something with more than one row.
const DATA = createMockDatasetData({
  cols: [
    createMockColumn({ display_name: "foo" }),
    createMockColumn({ display_name: "bar" }),
  ],
  rows: [
    [10, 20],
    [100, 200],
  ],
});

describe("applyDefaultVisualizationProps", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("isSensible", () => {
    it("should treat a plugin that doesn't define `isSensible` as sensible (metabase#GDGT-2286)", () => {
      const visualization = registerMockCustomViz({
        display: "custom:no-opinion",
      });

      expect(visualization.isSensible?.(DATA)).toBe(true);
      expect(getSensibleDisplays(DATA)).toContain("custom:no-opinion");
    });

    it("should use the sensibility reported by the plugin", () => {
      const visualization = registerMockCustomViz({
        display: "custom:one-column-only",
        isSensible: ({ cols }) => cols.length === 1,
      });

      expect(visualization.isSensible?.(DATA)).toBe(false);
      expect(getSensibleDisplays(DATA)).not.toContain("custom:one-column-only");
    });

    it("should keep the display when a question is re-run without previous results, as after a drill-through (metabase#GDGT-2286)", () => {
      const display: CustomVizDisplayType = "custom:drill-through";
      registerMockCustomViz({ display });

      const question = Question.create({
        metadata: SAMPLE_METADATA,
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: { "source-table": ORDERS_ID },
        },
      })
        .setDisplay(display)
        .lockDisplay();

      // `previousSensibleDisplays` is undefined because the drill clears the
      // previous query results before running the new query.
      const drilledQuestion = question.maybeResetDisplay(
        DATA,
        getSensibleDisplays(DATA),
        undefined,
      );

      expect(drilledQuestion.display()).toBe(display);
      expect(drilledQuestion.displayIsLocked()).toBe(true);
    });

    it("should stay sensible when the plugin throws", () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);

      const visualization = registerMockCustomViz({
        display: "custom:broken",
        isSensible: () => {
          throw new Error("boom");
        },
      });

      expect(visualization.isSensible?.(DATA)).toBe(true);
      expect(console.error).toHaveBeenCalled();
    });
  });
});
