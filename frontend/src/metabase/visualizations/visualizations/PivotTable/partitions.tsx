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

// For native SQL queries, numeric/metric columns should go to Measures (values),
// not Rows/Columns. This filter allows native columns only if they are non-metric.
const isDimensionForNative = (col: DatasetColumn) =>
  col.source === "native" ? !isMetric(col) : isDimension(col);

export const partitions: Partition[] = [
  {
    name: "rows",
    columnFilter: isDimensionForNative,
    title: (
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Rows`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "columns",
    columnFilter: isDimensionForNative,
    maxSize: 1,
    title: (
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Breakdown`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "values",
    columnFilter: (col) => !isDimension(col) || col.source === "native",
    title: (
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Measures`}</PivotTableSettingLabel>
    ),
  },
];
