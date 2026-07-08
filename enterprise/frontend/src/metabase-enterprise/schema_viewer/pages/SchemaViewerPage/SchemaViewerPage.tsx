import type { Location } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Stack } from "metabase/ui";
import { getSchemaViewerParams } from "metabase/urls";
import { useGetErdQuery } from "metabase-enterprise/api";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

import { SchemaViewer } from "../../components/SchemaViewer";
import { useSchemaPreferencesStore } from "../../components/SchemaViewer/hooks/useSchemaPreferencesStore";

import { useRedirectToLastDatabase } from "./useRedirectToLastDatabase";

type SchemaViewerPageQuery = {
  "database-id"?: string;
  "table-ids"?: string | string[];
  schema?: string;
};

type SchemaViewerPageProps = {
  location?: Location<SchemaViewerPageQuery>;
};

export function SchemaViewerPage({ location }: SchemaViewerPageProps) {
  usePageTitle(t`Schema viewer`);

  const rawDatabaseId = location?.query?.["database-id"];
  const rawTableIds = location?.query?.["table-ids"];
  const schema = location?.query?.schema;

  const databaseId: DatabaseId | undefined =
    rawDatabaseId != null ? Number(rawDatabaseId) : undefined;

  const tableIds: ConcreteTableId[] | undefined = useMemo(() => {
    if (rawTableIds == null) {
      return undefined;
    }
    const ids = Array.isArray(rawTableIds) ? rawTableIds : [rawTableIds];
    return ids.map(Number);
  }, [rawTableIds]);

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
