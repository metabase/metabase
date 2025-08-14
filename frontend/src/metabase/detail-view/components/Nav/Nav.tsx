import type { ReactNode } from "react";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { Box, Group, Icon, Text, rem } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { Breadcrumb } from "./Breadcrumb";
import { getExploreTableUrl } from "./utils";

interface Props {
  rowName: ReactNode;
  table: Table;
}

export const Nav = ({ rowName, table }: Props) => {
  const { data: schemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      table && table.db_id && table.schema ? { id: table.db_id } : skipToken,
    );

  // TODO: error handling, loading state handling
  if (!table || !table.db || isLoadingSchemas) {
    return null;
  }

  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      <Breadcrumb href={`/browse/databases/${table.db_id}`}>
        <Group align="center" gap={rem(10)} wrap="nowrap">
          <Icon flex="0 0 auto" name="database" />

          <Box>{table.db.name}</Box>
        </Group>
      </Breadcrumb>

      {schemas && schemas.length > 1 && table.schema && (
        <>
          <Separator />

          <Breadcrumb
            href={`/browse/databases/${table.db_id}/schema/${table.schema}`}
          >
            {table.schema}
          </Breadcrumb>
        </>
      )}

      <Separator />

      <Breadcrumb href={getExploreTableUrl(table)}>
        {table.display_name}
      </Breadcrumb>

      {rowName && (
        <>
          <Separator />

          <Breadcrumb>{rowName}</Breadcrumb>
        </>
      )}
    </Group>
  );
};

const Separator = () => (
  <Text c="text-secondary" flex="0 0 auto" fw="bold">
    /
  </Text>
);
