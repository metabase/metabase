import {
  COLUMN_SHOW_TOTALS,
  COLUMN_SPLIT_SETTING,
  computeNativePivotTotals,
  multiLevelPivot,
} from "metabase/visualizations/lib/data_grid";
import { TYPE } from "metabase-lib/v1/types/constants";

// Native columns (no pivot-grouping column => native synthesis path).
const col = (name, base = TYPE.Text) => ({
  name,
  display_name: name,
  base_type: base,
  source: "native",
});

// Schema mirrors the retention breakdown query: cohort_date + breakdown dims,
// new_user (the cohort-size weight) and a percent rate column d0.
const COHORT = col("cohort_date");
const COUNTRY = col("country");
const NEW_USER = col("new_user", TYPE.Integer);
const D0 = col("d0", TYPE.Float);

function nativeData(rows) {
  return { rows, cols: [COHORT, COUNTRY, NEW_USER, D0] };
}

// new_user is a count (style undefined => sum), d0 is a percent (=> weighted).
function settings({ collapsedRows = [] } = {}) {
  return {
    column: (c) => ({
      column: c,
      [COLUMN_SHOW_TOTALS]: true,
      number_style: c.name === "d0" ? "percent" : undefined,
    }),
    [COLUMN_SPLIT_SETTING]: {
      rows: ["cohort_date", "country"],
      columns: [],
      values: ["new_user", "d0"],
    },
    "pivot_table.collapsed_rows": { value: collapsedRows },
    "pivot.show_row_totals": true,
    "pivot.show_column_totals": false,
    "pivot.condense_duplicate_totals": true,
    "pivot.subtotals_on_top": true,
  };
}

describe("native pivot weighted percent subtotals", () => {
  // One cohort_date "2024-01-01" with breakdown cells of varying size.
  // Big cell (10 users) at 50%, plus four single-user cells: 0,0,0,100%.
  //   pooled rate = (10*0.5 + 1*0 + 1*0 + 1*0 + 1*1) / (10+1+1+1+1)
  //               = (5 + 1) / 14 = 0.428571...
  //   unweighted avg = (0.5 + 0 + 0 + 0 + 1) / 5 = 0.30  <-- the bug, reads low
  const data = nativeData([
    ["2024-01-01", "US", 10, 0.5],
    ["2024-01-01", "ID", 1, 0],
    ["2024-01-01", "MY", 1, 0],
    ["2024-01-01", "SG", 1, 0],
    ["2024-01-01", "TH", 1, 1],
  ]);

  it("weights percent subtotal by the count column (pooled), not unweighted avg", () => {
    const result = multiLevelPivot(data, settings({ collapsedRows: ["1"] }));
    expect(result).not.toBeNull();

    // Collapsed: the cohort_date row shows the subtotal in its body section.
    // getRowSection(col, row) -> array of {value, ...} per measure column.
    const section = result.getRowSection(0, 0);
    // Two measures: new_user (count) then d0 (percent).
    const values = section.map((c) => c.value);
    // new_user subtotal = sum = 14
    expect(values[0]).toBe("14");
    // d0 subtotal should be the weighted/pooled 6/14 = 0.4286 (~42.86%), NOT
    // the unweighted mean 0.30 (30%) that the old AVG(rate) bug produced.
    expect(values[1]).toBe("42.86%");
  });

  it("excludes null rate cells (and their weight) from the weighted total", () => {
    // Same big cell at 50%, but the small cells have a NULL rate (day not yet
    // elapsed). Their weight must NOT dilute the total:
    //   weighted = (10*0.5) / 10 = 0.5 (50%), ignoring the 4 null cells.
    // If null-cell weights were wrongly included the denominator would be 14
    // and the result would read low (5/14 = 36%).
    const withNulls = nativeData([
      ["2024-01-01", "US", 10, 0.5],
      ["2024-01-01", "ID", 1, null],
      ["2024-01-01", "MY", 1, null],
      ["2024-01-01", "SG", 1, null],
      ["2024-01-01", "TH", 1, null],
    ]);
    const result = multiLevelPivot(
      withNulls,
      settings({ collapsedRows: ["1"] }),
    );
    const values = result.getRowSection(0, 0).map((c) => c.value);
    expect(values[0]).toBe("14"); // new_user still sums all cells
    expect(values[1]).toBe("50%"); // weighted over non-null cells only
  });
});

describe("computeNativePivotTotals", () => {
  const cols = [COHORT, COUNTRY, NEW_USER, D0];
  const getColumnSetting = (c) => ({
    number_style: c.name === "d0" ? "percent" : undefined,
  });
  const columnSplit = {
    rows: ["cohort_date", "country"],
    columns: [],
    values: ["new_user", "d0"],
  };

  it("returns summed counts and weighted percent grand totals", () => {
    const data = {
      cols,
      rows: [
        ["2024-01-01", "US", 10, 0.5],
        ["2024-01-01", "ID", 1, 0],
        ["2024-01-02", "US", 1, 0],
        ["2024-01-02", "TH", 1, 1],
      ],
    };
    const totals = computeNativePivotTotals(
      data,
      columnSplit,
      getColumnSetting,
    );
    expect(totals).toHaveLength(2);
    // new_user = sum = 13
    expect(totals[0]).toMatchObject({ name: "new_user", isPercent: false });
    expect(totals[0].value).toBe(13);
    // d0 weighted = (10*.5 + 1*0 + 1*0 + 1*1) / 13 = 6/13
    expect(totals[1]).toMatchObject({ name: "d0", isPercent: true });
    expect(totals[1].value).toBeCloseTo(6 / 13, 10);
  });

  it("ignores null percent cells (and their weight)", () => {
    const data = {
      cols,
      rows: [
        ["2024-01-01", "US", 10, 0.5],
        ["2024-01-01", "ID", 5, null],
      ],
    };
    const totals = computeNativePivotTotals(
      data,
      columnSplit,
      getColumnSetting,
    );
    expect(totals[0].value).toBe(15); // counts still sum
    expect(totals[1].value).toBeCloseTo(0.5, 10); // only the non-null cell
  });

  it("returns null for non-native data", () => {
    const withGroup = {
      cols: [...cols, { name: "pivot-grouping", base_type: TYPE.Integer }],
      rows: [],
    };
    expect(
      computeNativePivotTotals(withGroup, columnSplit, getColumnSetting),
    ).toBeNull();
  });
});
