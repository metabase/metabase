import type { Location } from "history";
import { useEffect, useMemo, useRef } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";
import type { CardId, ConcreteTableId, DatabaseId } from "metabase-types/api";

import { SchemaViewer } from "../../components/SchemaViewer";
import { decodeSchemaViewerShareState } from "../../components/SchemaViewer/useSchemaViewerShareUrl";

type SchemaViewerPageQuery = {
  "model-id"?: string;
  "database-id"?: string;
  "table-ids"?: string | string[];
  schema?: string;
  share?: string;
  hops?: string;
};

type SchemaViewerPageProps = {
  location?: Location<SchemaViewerPageQuery>;
};

export function SchemaViewerPage({ location }: SchemaViewerPageProps) {
  usePageTitle(t`Schema viewer`);
  const dispatch = useDispatch();

  const rawShare = location?.query?.share;
  const sharedState = useMemo(
    () =>
      rawShare != null ? decodeSchemaViewerShareState(rawShare) : undefined,
    [rawShare],
  );

  const rawModelId = location?.query?.["model-id"];
  const rawDatabaseId = location?.query?.["database-id"];
  const rawTableIds = location?.query?.["table-ids"];
  const rawHops = location?.query?.hops;
  const schema = location?.query?.schema;

  const modelId: CardId | undefined =
    rawModelId != null ? Number(rawModelId) : undefined;
  const databaseId: DatabaseId | undefined =
    rawDatabaseId != null ? Number(rawDatabaseId) : undefined;
  const initialHops: number | undefined =
    rawHops != null ? Number(rawHops) : undefined;

  const initialTableIds = useMemo(() => {
    if (rawTableIds == null) {
      return undefined;
    }
    const ids = Array.isArray(rawTableIds) ? rawTableIds : [rawTableIds];
    return ids.map((id) => Number(id) as ConcreteTableId);
  }, [rawTableIds]);

  // Persist last opened database/schema
  const {
    value: lastDatabase,
    setValue: setLastDatabase,
    isLoading: isLoadingLastDatabase,
  } = useUserKeyValue<{ databaseId: DatabaseId; schema?: string }>({
    namespace: "schema_viewer",
    key: "last_database",
  });

  // Fetch databases to validate saved preference exists
  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();

  const databases = useMemo(
    () => databasesResponse?.data?.filter((db) => !db.is_saved_questions),
    [databasesResponse],
  );

  // Effective database/schema (from shared state or URL)
  const effectiveDatabaseId = sharedState?.databaseId ?? databaseId;
  const effectiveSchema = sharedState?.schema ?? schema;

  // Redirect to last opened database only on initial load (not when user clears selection)
  const hasUrlSelection =
    modelId != null || databaseId != null || rawShare != null;
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // Only redirect once on initial load
    if (hasRedirectedRef.current) {
      return;
    }

    if (
      !isLoadingLastDatabase &&
      !isLoadingDatabases &&
      !hasUrlSelection &&
      lastDatabase != null &&
      databases != null
    ) {
      // Validate saved database still exists
      const dbExists = databases.some(
        (db) => db.id === lastDatabase.databaseId,
      );
      if (dbExists) {
        hasRedirectedRef.current = true;
        const url =
          lastDatabase.schema != null
            ? Urls.dataStudioErdSchema(
                lastDatabase.databaseId,
                lastDatabase.schema,
              )
            : Urls.dataStudioErdDatabase(lastDatabase.databaseId);
        dispatch(push(url));
      }
    }

    // Mark as "redirected" even if we didn't redirect (no saved db or db doesn't exist)
    // This prevents future redirects when user clears selection
    if (!isLoadingLastDatabase && !isLoadingDatabases) {
      hasRedirectedRef.current = true;
    }
  }, [
    isLoadingLastDatabase,
    isLoadingDatabases,
    hasUrlSelection,
    lastDatabase,
    databases,
    dispatch,
  ]);

  // Save current database/schema as last opened
  useEffect(() => {
    if (effectiveDatabaseId != null) {
      setLastDatabase({
        databaseId: effectiveDatabaseId,
        schema: effectiveSchema,
      });
    }
  }, [effectiveDatabaseId, effectiveSchema, setLastDatabase]);

  return (
    <Stack h="100%">
      <SchemaViewer
        modelId={modelId}
        databaseId={effectiveDatabaseId}
        schema={effectiveSchema}
        initialTableIds={sharedState?.tableIds ?? initialTableIds}
        initialHops={sharedState?.hops ?? initialHops}
      />
    </Stack>
  );
}
