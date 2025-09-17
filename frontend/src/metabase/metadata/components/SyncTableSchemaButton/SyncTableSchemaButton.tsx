import { t } from "ttag";

import { useSyncTableSchemaMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

export function SyncTableSchemaButton({ tableId }: { tableId: TableId }) {
  const [syncTableSchema] = useSyncTableSchemaMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const { sendErrorToast } = useMetadataToasts();

  const handleClick = async () => {
    const { error } = await syncTableSchema(tableId);

    if (error) {
      sendErrorToast(t`Failed to start sync`);
    } else {
      setStarted(true);
    }
  };

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Sync triggered!` : t`Sync table schema`}
    </Button>
  );
}
