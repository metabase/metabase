import { useEffect, useMemo } from "react";
import type { WithRouterProps } from "react-router";

import { skipToken } from "metabase/api";
import {
  useListDatabaseSchemaTablesQuery,
  useListDatabasesQuery,
} from "metabase/api/database";
import { useGetTableQueryMetadataQuery } from "metabase/api/table";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { dataStudioData } from "metabase/lib/urls/data-studio";

export function CatalogNameRedirect({ location, router }: WithRouterProps) {
  const { database, schema, table, field } = location.query;

  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();

  const matchedDatabase = useMemo(
    () => databasesResponse?.data.find((db) => db.name === database),
    [databasesResponse, database],
  );

  const databaseId = matchedDatabase?.id;

  const needsTable = !!table;
  const { data: tables, isLoading: isLoadingTables } =
    useListDatabaseSchemaTablesQuery(
      databaseId != null && needsTable && schema
        ? { id: databaseId, schema }
        : skipToken,
    );

  const matchedTable = useMemo(
    () => tables?.find((t) => t.name === table),
    [tables, table],
  );

  const tableId = matchedTable?.id;

  const needsField = !!field;
  const { data: tableMetadata, isLoading: isLoadingMetadata } =
    useGetTableQueryMetadataQuery(
      tableId != null && needsField ? { id: tableId } : skipToken,
    );

  const matchedField = useMemo(
    () => tableMetadata?.fields?.find((f) => f.name === field),
    [tableMetadata, field],
  );

  const isLoading = isLoadingDatabases || isLoadingTables || isLoadingMetadata;

  const resolvedUrl = useMemo(() => {
    if (!database || databaseId == null) {
      return null;
    }

    if (!schema) {
      return dataStudioData({ databaseId });
    }

    if (!table) {
      return dataStudioData({ databaseId, schemaName: schema });
    }

    if (tableId == null) {
      return null;
    }

    if (!field) {
      return dataStudioData({ databaseId, schemaName: schema, tableId });
    }

    const fieldId = matchedField?.id;
    if (fieldId == null) {
      return null;
    }

    return dataStudioData({
      databaseId,
      schemaName: schema,
      tableId,
      tab: "field",
      fieldId,
    });
  }, [database, databaseId, schema, table, tableId, field, matchedField]);

  const isNotFound =
    !isLoading &&
    (resolvedUrl == null ||
      (database && !matchedDatabase) ||
      (needsTable && tables && !matchedTable) ||
      (needsField && tableMetadata && !matchedField));

  useEffect(() => {
    if (!isLoading && resolvedUrl) {
      router.replace(resolvedUrl);
    }
  }, [isLoading, resolvedUrl, router]);

  if (isNotFound) {
    return <NotFound />;
  }

  return <LoadingAndErrorWrapper loading={isLoading} />;
}
