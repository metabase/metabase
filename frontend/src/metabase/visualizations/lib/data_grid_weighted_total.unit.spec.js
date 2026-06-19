import {
  COLUMN_SHOW_TOTALS,
  COLUMN_SPLIT_SETTING,
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
