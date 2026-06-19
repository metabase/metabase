import { t } from "ttag";

import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { PivotTableSettingLabel } from "./PivotTable.styled";

export interface Partition {
  name: "rows" | "columns" | "values";
  columnFilter: (col: DatasetColumn) => boolean;
  title: React.ReactNode;
  // Optional maximum number of columns this partition can hold. The "Breakdown"
  // partition is limited to a single dimension.
  maxSize?: number;
}

// A native pivot column may arrive with source "native" (ad-hoc) or re-sourced
// to "fields" (saved/dashboard card), so we cannot rely on source alone.
// Classify by type: metric/numeric columns are measures, everything else is a
// dimension. For structured queries this still matches isDimension/!isDimension.
const isDimensionColumn = (col: DatasetColumn) =>
  isDimension(col) && !isMetric(col);
const isMeasureColumn = (col: DatasetColumn) =>
  !isDimension(col) || isMetric(col);

export const partitions: Partition[] = [
  {
    name: "rows",
    columnFilter: isDimensionColumn,
    title: (
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Rows`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "columns",
    columnFilter: isDimensionColumn,
    maxSize: 1,
    title: (
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Breakdown`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "values",
    columnFilter: isMeasureColumn,
    title: (
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Measures`}</PivotTableSettingLabel>
    ),
  },
];
