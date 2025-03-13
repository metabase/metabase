import type React from "react";
import { t } from "ttag";

import { Box, Group, Title } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { TableDataViewBackButton } from "./TableDataViewBackButton";

interface TableDataViewHeaderProps {
  table: Table;
}

export const TableDataViewHeader = ({
  table,
}: TableDataViewHeaderProps): React.JSX.Element => {
  return (
    <Box
      p="lg"
      data-testid="table-data-view-header"
      bd="1px solid var(--mb-color-border)"
    >
      <Group gap="sm">
        <TableDataViewBackButton table={table} />
        <Title>{t`Editing ${table.display_name}`}</Title>
      </Group>
    </Box>
  );
};
