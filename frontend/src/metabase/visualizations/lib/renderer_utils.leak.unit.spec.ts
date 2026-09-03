import {
  formatRetentionProfile,
  profileCacheRetention,
  requireGarbageCollection,
  settleAndCollect,
} from "__support__/memory";
import { dayjs } from "metabase/dayjs";
import {
  getXValues,
  parseXValue,
} from "metabase/visualizations/lib/renderer_utils";
import type {
  RowValues,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const TIMESERIES: VisualizationSettings = {
  "graph.x_axis.scale": "timeseries",
};

const BATCH = 50_000;

// 50,000 values cost 22.5 MB when the cache was module-level. Anything near
// that means the cache escaped the call again.
const RETENTION_BUDGET_MB = 1;

function seriesFromRows(listOfRows: RowValues[][]): Series {
  const series: Series = listOfRows.map((rows) => ({
    card: createMockCard(),
    data: createMockDatasetData({ rows, cols: [createMockColumn()] }),
  }));
  Object.assign(series, { _raw: series });
  return series;
}

function isoDay(dayOffset: number): string {
  return dayjs("1970-01-01").add(dayOffset, "day").format("YYYY-MM-DD");
}

function isoDays(firstOffset: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    isoDay(firstOffset + index),
  );
}

/** One full getXValues pass that drops every reference to its input. */
function renderChartWithValues(values: string[]) {
  const rows: RowValues[] = values.map((value) => [value]);
  getXValues({ series: seriesFromRows([rows]), settings: TIMESERIES });
}

function makeParsedDayjsRef(): WeakRef<object> {
  const parsed = parseXValue("2031-05-06", { isTimeseries: true });
  if (!dayjs.isDayjs(parsed)) {
    throw new Error("expected the timeseries path to return a Dayjs");
  }
  return new WeakRef(parsed);
}

describe("renderer_utils parsed x value caching", () => {
  describe("dedupe still works inside one pass", () => {
    it("cannot dedupe two independently parsed Dayjs values in a Set", () => {
      const timestamp = "2024-03-02";

      expect(new Set([dayjs(timestamp), dayjs(timestamp)]).size).toBe(2);
    });

    it("dedupes a timestamp shared by two series of the same chart", () => {
      const series = seriesFromRows([
        [["2021-01-01"], ["2021-01-02"]],
        [["2021-01-01"], ["2021-01-03"]],
      ]);

      // 4 rows, 3 distinct instants. This only collapses to 3 while every
      // series in the pass shares one cache, so the repeated timestamp comes
      // back as the identical Dayjs.
      expect(getXValues({ series, settings: TIMESERIES })).toHaveLength(3);
    });
  });

  describe("nothing outlives the call", () => {
    it("does not intern parsed values across separate calls", () => {
      const first = parseXValue("2024-03-01", { isTimeseries: true });
      const second = parseXValue("2024-03-01", { isTimeseries: true });

      expect(dayjs.isDayjs(first)).toBe(true);
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });

    it("releases a parsed value once its caller is done", async () => {
      requireGarbageCollection();

      const parsed = makeParsedDayjsRef();
      await settleAndCollect();

      expect(parsed.deref()).toBeUndefined();
    });

    it("retains nothing after a pass over many distinct x values", () => {
      requireGarbageCollection();

      renderChartWithValues([isoDay(0)]);

      const firstValues = isoDays(1, BATCH);
      const laterValues = isoDays(1 + BATCH, BATCH);

      const profile = profileCacheRetention({
        driveNewKeys: () => renderChartWithValues(firstValues),
        driveSameKeys: () => renderChartWithValues(firstValues),
        driveMoreNewKeys: () => renderChartWithValues(laterValues),
      });

      // eslint-disable-next-line no-console
      console.log(
        formatRetentionProfile(profile, {
          entryCount: BATCH,
          entryLabel: "distinct x values",
        }),
      );

      expect(profile.newKeysMb).toBeLessThan(RETENTION_BUDGET_MB);
      expect(profile.moreNewKeysMb).toBeLessThan(RETENTION_BUDGET_MB);
    });
  });
});
