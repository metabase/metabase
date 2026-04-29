import type { Location } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Stack } from "metabase/ui";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

import { SchemaViewer } from "../../components/SchemaViewer";
import { useRestoreSchemaViewerState } from "../../components/SchemaViewer/hooks/useRestoreSchemaViewerState";

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

  const initialTableIds = useMemo(() => {
    if (rawTableIds == null) {
      return undefined;
    }
    const ids = Array.isArray(rawTableIds) ? rawTableIds : [rawTableIds];
    return ids.map((id) => Number(id) as ConcreteTableId);
  }, [rawTableIds]);

  const { extraTableIds, addExtraTableId, contextKey } =
    useRestoreSchemaViewerState({ databaseId, schema, initialTableIds });

  return (
    <Stack h="100%">
      <SchemaViewer
        databaseId={databaseId}
        schema={schema}
        extraTableIds={extraTableIds}
        onExtraTableIdAdd={addExtraTableId}
        contextKey={contextKey}
      />
    </Stack>
  );
}
