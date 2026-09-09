import { requireGarbageCollection, settleAndCollect } from "__support__/memory";
import { PIE_CHART_DEFINITION } from "metabase/visualizations/visualizations/PieChart/definition";
import type { RawSeries, RowValues } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const ROWS = 200;

/**
 * `pie.metric` and `pie.dimension` are absent, so getPieRows returns early.
 * That keeps this test about the cache rather than about the row computation.
 */
const NO_SETTINGS = {};

function makeSeries(): RawSeries {
  const rows: RowValues[] = Array.from({ length: ROWS }, (_, index) => [
    `category ${index}`,
    index,
  ]);

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

/** Computes the rows for one dataset, then drops every reference to it. */
function makeRowsRef(): WeakRef<object> {
  const getValue = PIE_CHART_DEFINITION.settings?.["pie.rows"]?.getValue;
  if (getValue == null) {
    throw new Error(
      "PIE_CHART_DEFINITION no longer exposes a pie.rows getValue",
    );
  }

  const rows = getValue(makeSeries(), NO_SETTINGS);
  if (!Array.isArray(rows)) {
    throw new Error("expected pie.rows to compute an array");
  }
  return new WeakRef(rows);
}

describe("PieChart pie.rows caching", () => {
  it("releases the computed rows once the chart is gone", async () => {
    requireGarbageCollection();

    const rows = makeRowsRef();
    await settleAndCollect();

    // The cache used to live at module scope, keyed on a JSON copy of every row
    // and column, so each result and its key outlived the chart.
    expect(rows.deref()).toBeUndefined();
  });
});
