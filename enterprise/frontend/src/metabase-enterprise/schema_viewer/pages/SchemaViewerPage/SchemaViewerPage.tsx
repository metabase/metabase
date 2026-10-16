import { useMemo } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useSearchParams } from "metabase/router";
import { Stack } from "metabase/ui";
import { getSchemaViewerParams } from "metabase/urls";
import { useGetErdQuery } from "metabase-enterprise/api";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

import { SchemaViewer } from "../../components/SchemaViewer";
import { useSchemaPreferencesStore } from "../../components/SchemaViewer/hooks/useSchemaPreferencesStore";

import { useRedirectToLastDatabase } from "./useRedirectToLastDatabase";

export function SchemaViewerPage() {
  const [searchParams] = useSearchParams();
  usePageTitle(t`Schema viewer`);

  const rawDatabaseId = searchParams.get("database-id");
  const schema = searchParams.get("schema") ?? undefined;
  // Joined rather than kept as the array `getAll` returns, so the memo below has
  // a stable dependency across renders.
  const rawTableIds = searchParams.getAll("table-ids").join(",");

  const databaseId: DatabaseId | undefined =
    rawDatabaseId != null ? Number(rawDatabaseId) : undefined;

  const tableIds: ConcreteTableId[] | undefined = useMemo(
    () => (rawTableIds === "" ? undefined : rawTableIds.split(",").map(Number)),
    [rawTableIds],
  );

  useRedirectToLastDatabase({ databaseId, schema });

  const { extraTableIds, addExtraTableId, contextKey, isRestoring } =
    useSchemaPreferencesStore({
      databaseId,
      schema,
      initialTableIds: tableIds,
    });

  // Defer the ERD query until per-context saved prefs have resolved — without
  // this gate we'd fire two requests on every schema entry: one with empty
  // `extraTableIds`, then another once the restored set arrives.
  const { data, isFetching, error } = useGetErdQuery(
    databaseId != null && !isRestoring
      ? getSchemaViewerParams({
          databaseId,
          schema,
          tableIds: extraTableIds,
        })
      : skipToken,
  );

  // Deep-link focal table: if the URL pins exactly one table-id, SchemaViewer
  // zooms to it after the first layout instead of fitting the whole canvas.
  const focalTableId =
    tableIds != null && tableIds.length === 1 ? tableIds[0] : null;

  return (
    <Stack h="100%">
      <SchemaViewer
        databaseId={databaseId}
        schema={schema}
        focalTableId={focalTableId}
        onExtraTableIdAdd={addExtraTableId}
        contextKey={contextKey}
        data={data}
        isFetching={isFetching}
        error={error}
      />
    </Stack>
  );
}
