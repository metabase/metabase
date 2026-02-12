import type { Location } from "history";
import { useMemo } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
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
    return ids.map(id => Number(id) as ConcreteTableId);
  }, [rawTableIds]);

  return (
    <Stack h="100%">
      <SchemaViewer
        modelId={modelId}
        databaseId={sharedState?.databaseId ?? databaseId}
        schema={sharedState?.schema ?? schema}
        initialTableIds={sharedState?.tableIds ?? initialTableIds}
        initialHops={sharedState?.hops ?? initialHops}
      />
    </Stack>
  );
}
