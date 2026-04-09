import type { ReactNode } from "react";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Group, type GroupProps } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { Breadcrumb } from "./Breadcrumb";
import { Separator } from "./Separator";

interface Props extends GroupProps {
  rowName: ReactNode;
  table: Table;
}

export const TableNav = ({ rowName, table, ...props }: Props) => {
  const { data: schemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      table && table.db_id && table.schema ? { id: table.db_id } : skipToken,
    );

  if (!table || !table.db || isLoadingSchemas) {
    return null;
  }

  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap" {...props}>
      <Breadcrumb href={`/browse/databases/${table.db_id}`} icon="database">
        {table.db.name}
      </Breadcrumb>

      {schemas && schemas.length > 1 && table.schema && (
        <>
          <Separator />

          <Breadcrumb
            href={`/browse/databases/${table.db_id}/schema/${encodeURIComponent(table.schema)}`}
          >
            {table.schema}
          </Breadcrumb>
        </>
      )}

      <Separator />

      <Breadcrumb href={Urls.tableRowsQuery(table.db_id, table.id)}>
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
