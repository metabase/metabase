import type { ReactNode } from "react";
import { type RouteComponentProps, withRouter } from "react-router";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { Box, Group, type GroupProps, Icon, Text, rem } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { Breadcrumb } from "./Breadcrumb";
import { getExploreTableUrl } from "./utils";

interface Props extends GroupProps, RouteComponentProps<void, void, void> {
  rowName: ReactNode;
  table: Table;
}

export const Nav = withRouter(({ rowName, table, ...props }: Props) => {
  const { data: schemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      table && table.db_id && table.schema ? { id: table.db_id } : skipToken,
    );

  // TODO: error handling, loading state handling
  if (!table || !table.db || isLoadingSchemas) {
    return null;
  }

  const url = getExploreTableUrl(table, props.location?.state?.card);

  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap" {...props}>
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

      <Breadcrumb href={url}>{table.display_name}</Breadcrumb>

      {rowName && (
        <>
          <Separator />

          <Breadcrumb>{rowName}</Breadcrumb>
        </>
      )}
    </Group>
  );
});

const Separator = () => (
  <Text c="text-secondary" flex="0 0 auto" fw="bold">
    /
  </Text>
);
