import type { Location } from "history";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Stack } from "metabase/ui";
import type { CardId, DatabaseId } from "metabase-types/api";

import { SchemaViewer } from "../../components/SchemaViewer";

type SchemaViewerPageQuery = {
  "model-id"?: string;
  "database-id"?: string;
  schema?: string;
};

type SchemaViewerPageProps = {
  location?: Location<SchemaViewerPageQuery>;
};

export function SchemaViewerPage({ location }: SchemaViewerPageProps) {
  usePageTitle(t`Schema viewer`);
  const rawModelId = location?.query?.["model-id"];
  const rawDatabaseId = location?.query?.["database-id"];
  const schema = location?.query?.schema;

  const modelId: CardId | undefined =
    rawModelId != null ? Number(rawModelId) : undefined;
  const databaseId: DatabaseId | undefined =
    rawDatabaseId != null ? Number(rawDatabaseId) : undefined;

  return (
    <Stack h="100%">
      <SchemaViewer
        modelId={modelId}
        databaseId={databaseId}
        schema={schema}
      />
    </Stack>
  );
}
