import React from "react";
import { t } from "ttag";

import type { Column } from "metabase-types/types/Dataset";

import { isDimension } from "metabase-lib/types/utils/isa";

import { PivotTableSettingLabel } from "./PivotTable.styled";

interface Partition {
  name: "rows" | "columns" | "values";
  columnFilter: (col: Column | undefined) => boolean;
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
