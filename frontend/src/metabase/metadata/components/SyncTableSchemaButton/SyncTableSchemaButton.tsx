import { t } from "ttag";

import { useSyncTableSchemaMutation } from "metabase/api";
import { useTemporaryState, useToast } from "metabase/common/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

export function SyncTableSchemaButton({ tableId }: { tableId: TableId }) {
  const [syncTableSchema] = useSyncTableSchemaMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const [sendToast] = useToast();

  const handleClick = async () => {
    const { error } = await syncTableSchema(tableId);

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to start sync`,
      });
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
