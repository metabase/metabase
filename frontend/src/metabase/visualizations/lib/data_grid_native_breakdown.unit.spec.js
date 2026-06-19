import {
  BREAKDOWN_DIMENSION_SETTING,
  COLLAPSED_ROWS_SETTING,
  COLUMN_SHOW_TOTALS,
  COLUMN_SPLIT_SETTING,
  multiLevelPivot,
} from "metabase/visualizations/lib/data_grid";
import { TYPE } from "metabase-lib/v1/types/constants";

// Native columns: no pivot-grouping column present, source "native".
const col = (name, base = TYPE.Text) => ({
  name,
  display_name: name,
  base_type: base,
  source: "native",
});

const COHORT = col("cohort_date");
const COUNTRY = col("country");
const NETWORK = col("network");
const CAMPAIGN = col("campaign");
const NEW_USERS = col("new_user_count", TYPE.Integer);

// 4 row dims + 1 measure, NO pivot-grouping column => native path.
function nativeData(rows) {
  return {
    rows,
    cols: [COHORT, COUNTRY, NETWORK, CAMPAIGN, NEW_USERS],
  };
}

function runNative(data, { collapsedRows = [], breakdown } = {}) {
  const settings = {
    column: (c) => ({
      column: c,
      [COLUMN_SHOW_TOTALS]: true,
    }),
    [COLUMN_SPLIT_SETTING]: {
      rows: ["cohort_date", "country", "network", "campaign"],
      columns: [],
      values: ["new_user_count"],
    },
    [COLLAPSED_ROWS_SETTING]: { value: collapsedRows },
    [BREAKDOWN_DIMENSION_SETTING]: breakdown ?? "country",
    "pivot.show_row_totals": true,
    "pivot.show_column_totals": false,
    "pivot.condense_duplicate_totals": true,
    "pivot.subtotals_on_top": true,
  };
  return multiLevelPivot(data, settings);
}

describe("native pivot breakdown collapse", () => {
  const data = nativeData([
    ["2024-01-01", "US", "google", "c1", 10],
    ["2024-01-01", "US", "meta", "c2", 5],
    ["2024-01-01", "ID", "google", "c1", 7],
    ["2024-01-02", "US", "google", "c1", 3],
    ["2024-01-02", "ID", "meta", "c2", 2],
  ]);

  it("reduces effective rows to [cohort_date, breakdown]", () => {
    const result = runNative(data, { breakdown: "country" });
    expect(result).not.toBeNull();
    // Only 2 effective row dims.
    expect(result.rowIndexes.length).toBe(2);
  });

  it("default-collapsed level 1 marks depth-0 rows collapsed", () => {
    const collapsed = runNative(data, {
      collapsedRows: ["1"],
      breakdown: "country",
    });
    const notCollapsed = runNative(data, {
      collapsedRows: [],
      breakdown: "country",
    });
    const depth0Collapsed = collapsed.leftHeaderItems.filter(
      (i) => i.depth === 0,
    );
    // When collapsed, no depth-1 (breakdown) rows should be visible for a
    // collapsed parent; expanded should show more left header items.
    expect(collapsed.leftHeaderItems.length).toBeLessThan(
      notCollapsed.leftHeaderItems.length,
    );
    expect(depth0Collapsed.length).toBeGreaterThan(0);
  });

  it("per-row collapse via path collapses only that group", () => {
    const collapsed = runNative(data, {
      collapsedRows: [JSON.stringify(["2024-01-01"])],
      breakdown: "country",
    });
    const expanded = runNative(data, {
      collapsedRows: [],
      breakdown: "country",
    });
    expect(collapsed.leftHeaderItems.length).toBeLessThan(
      expanded.leftHeaderItems.length,
    );
  });
});
