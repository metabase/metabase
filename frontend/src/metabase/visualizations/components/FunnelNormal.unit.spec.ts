import { calculateFunnelSteps } from "metabase/visualizations/lib/funnel/utils";
import type { RowValues } from "metabase-types/api";
import { getRowsForStableKeys } from "metabase-types/api";

import { getSortedRows } from "./FunnelNormal";

/**
 * These tests replicate the data flow inside FunnelNormal to demonstrate the
 * bug in https://github.com/metabase/metabase/issues/71488.
 *
 * When content translation is active, `data.rows` contains translated values
 * while `data.untranslatedRows` contains the originals. The `funnel.rows`
 * setting keys are generated from `getRowsForStableKeys` (which prefers
 * untranslatedRows), but FunnelNormal must match those keys against the
 * untranslated rows and then return the *translated* rows for display.
 */
describe("FunnelNormal row matching (metabase#71488)", () => {
  const untranslatedRows: RowValues[] = [
    ["Awareness", 1000],
    ["Consideration", 600],
    ["Purchase", 200],
  ];

  const translatedRows: RowValues[] = [
    ["Povědomí", 1000],
    ["Zvažování", 600],
    ["Nákup", 200],
  ];

  // Keys generated from untranslatedRows via getRowsForStableKeys,
  // matching how Funnel.tsx getValue computes funnel.rows
  const funnelRowsSettings = [
    { key: "Awareness", name: "Awareness", enabled: true },
    { key: "Consideration", name: "Consideration", enabled: true },
    { key: "Purchase", name: "Purchase", enabled: true },
  ];

  const dimensionIndex = 0;

  it("matches rows when there is no content translation", () => {
    const sortedRows = getSortedRows(
      untranslatedRows,
      untranslatedRows,
      dimensionIndex,
      funnelRowsSettings,
    );
    expect(sortedRows).toHaveLength(3);
  });

  it("returns translated rows for display while matching on untranslated keys", () => {
    const data = { rows: translatedRows, untranslatedRows };
    const rowsForKeys = getRowsForStableKeys(data);
    const sortedRows = getSortedRows(
      data.rows,
      rowsForKeys,
      dimensionIndex,
      funnelRowsSettings,
    );

    expect(sortedRows).toHaveLength(3);

    // The displayed dimension values should be the translated ones
    expect(sortedRows[0][dimensionIndex]).toBe("Povědomí");
    expect(sortedRows[1][dimensionIndex]).toBe("Zvažování");
    expect(sortedRows[2][dimensionIndex]).toBe("Nákup");

    // Metrics should still be correct
    const metrics = sortedRows.map((row) => row[1]) as number[];
    const funnelData = metrics.map(
      (metric, i) => [i, metric] as [number, number],
    );
    expect(() => calculateFunnelSteps(funnelData, 1, 1)).not.toThrow();
  });

  it("handles disabled rows correctly", () => {
    const data = { rows: translatedRows, untranslatedRows };
    const rowsForKeys = getRowsForStableKeys(data);
    const settingsWithDisabled = [
      { key: "Awareness", name: "Awareness", enabled: true },
      { key: "Consideration", name: "Consideration", enabled: false },
      { key: "Purchase", name: "Purchase", enabled: true },
    ];
    const sortedRows = getSortedRows(
      data.rows,
      rowsForKeys,
      dimensionIndex,
      settingsWithDisabled,
    );

    expect(sortedRows).toHaveLength(2);
    expect(sortedRows[0][dimensionIndex]).toBe("Povědomí");
    expect(sortedRows[1][dimensionIndex]).toBe("Nákup");
  });
});
