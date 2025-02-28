import type React from "react";
import { t } from "ttag";

import { Box, Group, Title } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { TableDataViewBackButton } from "./TableDataViewBackButton";

interface TableDataViewHeaderProps {
  database: Database;
  tableName?: string;
}

export const TableDataViewHeader = ({
  database,
  tableName,
}: TableDataViewHeaderProps): React.JSX.Element => {
  return (
    <Box
      p="lg"
      data-testid="table-data-view-header"
      bd="1px solid var(--mb-color-border)"
    >
      <Group gap="sm">
        <TableDataViewBackButton database={database} />
        {tableName && <Title>{t`Editing ${tableName}`}</Title>}
      </Group>
    </Box>
  );
};
