import type { ReactNode } from "react";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import { Group, type GroupProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import { type Table, isConcreteTableId } from "metabase-types/api";

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
      <Breadcrumb
        icon="database"
        to={Urls.browseDatabase(table.db)}
        showTooltip
      >
        {table.db.name}
      </Breadcrumb>

      {schemas && schemas.length > 1 && table.schema && (
        <>
          <Separator />

          <Breadcrumb
            to={Urls.browseSchemaBySlug(
              Urls.databaseSlug(table.db),
              table.schema,
            )}
            showTooltip
          >
            {table.schema}
          </Breadcrumb>
        </>
      )}

      <Separator />

      <Breadcrumb
        to={
          isConcreteTableId(table.id)
            ? Urls.table({ id: table.id, name: table.display_name })
            : Urls.tableRowsQuery(table.db_id, table.id)
        }
        showTooltip
      >
        {table.display_name}
      </Breadcrumb>

      {rowName && (
        <>
          <Separator />

          <Breadcrumb showTooltip>{rowName}</Breadcrumb>
        </>
      )}
    </Group>
  );
};
