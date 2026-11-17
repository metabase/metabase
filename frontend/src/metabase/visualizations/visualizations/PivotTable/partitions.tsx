import { t } from "ttag";

import { Box } from "metabase/ui";
import { isDimension } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

const SettingLabel = ({ children }: { children: React.ReactNode }) => (
  <Box
    component="span"
    c="text-primary"
    fw={700}
    data-testid="pivot-table-setting"
  >
    {children}
  </Box>
);

export interface Partition {
  name: "rows" | "columns" | "values";
  columnFilter: (col: DatasetColumn) => boolean;
  title: React.ReactNode;
}

export const getPartitions = (): Partition[] => [
  {
    name: "rows",
    columnFilter: isDimension,
    title: <SettingLabel>{t`Rows`}</SettingLabel>,
  },
  {
    name: "columns",
    columnFilter: isDimension,
    title: <SettingLabel>{t`Columns`}</SettingLabel>,
  },
  {
    name: "values",
    columnFilter: (col) => !isDimension(col),
    title: <SettingLabel>{t`Measures`}</SettingLabel>,
  },
];
