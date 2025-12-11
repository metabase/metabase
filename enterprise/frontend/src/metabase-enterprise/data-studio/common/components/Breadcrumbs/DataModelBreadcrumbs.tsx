import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo } from "react";

import { useListDatabaseSchemasQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import type { Table } from "metabase-types/api";

import { type BreadcrumbItem, Breadcrumbs } from "./Breadcrumbs";

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
  const { data: schemas } = useListDatabaseSchemasQuery(
    table.db_id ? { id: table.db_id } : skipToken,
  );

  const items: BreadcrumbItem[] = useMemo(() => {
    const result: BreadcrumbItem[] = [];
    const showSchema = schemas && schemas.length > 1 && table.schema;

    if (table.db) {
      result.push({
        label: table.db.name,
        to: Urls.dataStudioData({ databaseId: table.db_id }),
      });
    }

    if (showSchema) {
      result.push({
        label: table.schema,
        to: Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
        }),
      });
    }

    result.push({
      label: table.display_name,
      to: tableListUrl,
    });

    result.push({
      label: entityName ?? newEntityLabel,
    });

    return result;
  }, [schemas, table, tableListUrl, entityName, newEntityLabel]);

  return <Breadcrumbs items={items} />;
}
