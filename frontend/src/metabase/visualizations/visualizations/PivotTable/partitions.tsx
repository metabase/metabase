import type * as React from "react";
import { t } from "ttag";

import { isDimension } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { PivotTableSettingLabel } from "./PivotTable.styled";

interface Partition {
  name: "rows" | "columns" | "values";
  columnFilter: (col: DatasetColumn | undefined) => boolean;
  title: React.ReactNode;
}

export const partitions: Partition[] = [
  {
    name: "rows",
    columnFilter: isDimension,
    title: (
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Rows`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "columns",
    columnFilter: isDimension,
    title: (
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Columns`}</PivotTableSettingLabel>
    ),
  },
  {
    name: "values",
    columnFilter: col => !isDimension(col),
    title: (
      <PivotTableSettingLabel data-testid="pivot-table-setting">{t`Measures`}</PivotTableSettingLabel>
    ),
  },
];
