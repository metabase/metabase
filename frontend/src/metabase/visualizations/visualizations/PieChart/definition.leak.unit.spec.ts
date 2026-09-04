import {
  formatRetentionProfile,
  profileCacheRetention,
  requireGarbageCollection,
} from "__support__/memory";
import { PIE_CHART_DEFINITION } from "metabase/visualizations/visualizations/PieChart/definition";
import type { RawSeries, RowValues } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const getPieRowsValue = PIE_CHART_DEFINITION.settings?.["pie.rows"]?.getValue;

if (getPieRowsValue == null) {
  throw new Error("PIE_CHART_DEFINITION no longer exposes a pie.rows getValue");
}

const ROWS_PER_DATASET = 2_000;
const DATASET_COUNT = 25;

// Pass 3 measured +1.2 MB, at 51 KB per dataset, when the memo key was a JSON
// copy of every row. See profileCacheRetention for why pass 1 is not asserted.
const RETENTION_BUDGET_MB = 0.5;

/**
 * `pie.metric` and `pie.dimension` are absent, so getPieRows returns early with
 * an empty array. That keeps these tests about the cache rather than about the
 * row computation, which pie.unit.spec covers.
 */
const NO_SETTINGS = {};

function makeSeries(datasetIndex: number): RawSeries {
  const rows: RowValues[] = Array.from(
    { length: ROWS_PER_DATASET },
    (_, rowIndex) => [
      `category ${datasetIndex}-${rowIndex}`,
      rowIndex * (datasetIndex + 1),
    ],
  );

  return [
    {
      card: createMockCard(),
      data: createMockDatasetData({
        rows,
        cols: [
          createMockColumn({ name: "category", display_name: "Category" }),
          createMockColumn({ name: "count", display_name: "Count" }),
        ],
      }),
    },
  ];
}

function makeDatasets(firstIndex: number, count: number): RawSeries[] {
  return Array.from({ length: count }, (_, index) =>
    makeSeries(firstIndex + index),
  );
}

function computePieRows(datasets: RawSeries[]) {
  datasets.forEach((series) => getPieRowsValue?.(series, NO_SETTINGS));
}

describe("PieChart pie.rows caching", () => {
  it("reuses the result for the same dataset and settings", () => {
    const series = makeSeries(900);

    expect(getPieRowsValue?.(series, NO_SETTINGS)).toBe(
      getPieRowsValue?.(series, NO_SETTINGS),
    );
  });

  it("recomputes for a deep-equal but separate dataset", () => {
    const series = makeSeries(901);
    const rebuilt: RawSeries = JSON.parse(JSON.stringify(series));

    expect(getPieRowsValue?.(rebuilt, NO_SETTINGS)).not.toBe(
      getPieRowsValue?.(series, NO_SETTINGS),
    );
  });

  it("retains nothing once the datasets are dropped", () => {
    requireGarbageCollection();

    const profile = profileCacheRetention({
      driveNewKeys: () => computePieRows(makeDatasets(0, DATASET_COUNT)),
      driveSameKeys: () => computePieRows(makeDatasets(0, DATASET_COUNT)),
      driveMoreNewKeys: () =>
        computePieRows(makeDatasets(DATASET_COUNT, DATASET_COUNT)),
    });

    // eslint-disable-next-line no-console
    console.log(
      formatRetentionProfile(profile, {
        entryCount: DATASET_COUNT,
        entryLabel: `distinct datasets of ${ROWS_PER_DATASET.toLocaleString()} rows`,
      }),
    );

    expect(profile.moreNewKeysMb).toBeLessThan(RETENTION_BUDGET_MB);
  });
});
