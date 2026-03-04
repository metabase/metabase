import { skipToken } from "@reduxjs/toolkit/query";
import { Link } from "react-router";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import * as Urls from "metabase/lib/urls";
import type { Table } from "metabase-types/api";

import { DataStudioBreadcrumbs } from "../DataStudioBreadcrumbs";

type DataModelBreadcrumbsProps = {
  table: Table;
  entityName: string | undefined;
  newEntityLabel: string;
  tableListUrl: string;
};

export function DataModelBreadcrumbs({
  table,
  entityName,
  newEntityLabel,
  tableListUrl,
}: DataModelBreadcrumbsProps) {
  const { data: schemas, isLoading } = useListDatabaseSchemasQuery(
    table.db_id ? { id: table.db_id } : skipToken,
  );

  const showSchema = schemas && schemas.length > 1 && table.schema;

  return (
    <DataStudioBreadcrumbs loading={isLoading}>
      {table.db && (
        <Link to={Urls.dataStudioData({ databaseId: table.db_id })}>
          <Ellipsified>{table.db.name}</Ellipsified>
        </Link>
      )}

      {showSchema && (
        <Link
          to={Urls.dataStudioData({
            databaseId: table.db_id,
            schemaName: table.schema,
          })}
        >
          <Ellipsified>{table.schema}</Ellipsified>
        </Link>
      )}
      <Link to={tableListUrl}>
        <Ellipsified>{table.display_name}</Ellipsified>
      </Link>
      <span>{entityName ?? newEntityLabel}</span>
    </DataStudioBreadcrumbs>
  );
}
