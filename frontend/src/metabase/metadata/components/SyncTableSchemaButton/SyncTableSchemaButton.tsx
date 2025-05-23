import { useEffect, useState } from "react";
import { t } from "ttag";

import { useSyncTableSchemaMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

export function SyncTableSchemaButton({ tableId }: { tableId: TableId }) {
  const [started, setStarted] = useState(0);
  const [syncTableSchema] = useSyncTableSchemaMutation();
  const [sendToast] = useToast();

  const handleClick = async () => {
    const { error } = await syncTableSchema(tableId);

    if (error) {
      sendToast({
        icon: "warning",
        message: t`Failed to start sync`,
        toastColor: "error",
      });
    } else {
      setStarted((started) => started + 1);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setStarted(0), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [started]);

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Sync triggered!` : t`Sync table schema`}
    </Button>
  );
}
