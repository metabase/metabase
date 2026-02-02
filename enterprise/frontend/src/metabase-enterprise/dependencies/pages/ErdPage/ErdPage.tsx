import type { Location } from "history";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Stack } from "metabase/ui";
import type { CardId, TableId } from "metabase-types/api";

import { Erd } from "../../components/Erd";

type ErdPageQuery = {
  "table-id"?: string;
  "model-id"?: string;
};

type ErdPageProps = {
  location?: Location<ErdPageQuery>;
};

export function ErdPage({ location }: ErdPageProps) {
  usePageTitle(t`Entity Relationship Diagram`);
  const rawTableId = location?.query?.["table-id"];
  const rawModelId = location?.query?.["model-id"];
  const tableId: TableId | undefined =
    rawTableId != null ? Number(rawTableId) : undefined;
  const modelId: CardId | undefined =
    rawModelId != null ? Number(rawModelId) : undefined;

  return (
    <Stack h="100%">
      <Erd tableId={tableId} modelId={modelId} />
    </Stack>
  );
}
