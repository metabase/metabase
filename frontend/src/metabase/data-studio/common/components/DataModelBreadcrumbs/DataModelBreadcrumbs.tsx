import { skipToken } from "@reduxjs/toolkit/query";
import type { ReactNode } from "react";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { Ellipsified } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type DataModelBreadcrumbsProps = {
  table: Table;
  entityName: string | undefined;
  newEntityLabel: string;
  tableListUrl: string;
  entityUrl?: string;
  entityChildName?: string;
  children?: ReactNode;
};

export function DataModelBreadcrumbs({
  table,
  entityName,
  newEntityLabel,
  tableListUrl,
  entityUrl,
  entityChildName,
  children,
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
      {entityUrl != null ? (
        <Link to={entityUrl}>{entityName ?? newEntityLabel}</Link>
      ) : (
        <span>{entityName ?? newEntityLabel}</span>
      )}
      {children || (entityChildName != null && <span>{entityChildName}</span>)}
    </DataStudioBreadcrumbs>
  );
}
