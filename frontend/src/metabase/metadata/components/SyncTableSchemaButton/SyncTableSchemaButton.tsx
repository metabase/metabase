import { useRef, useState } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useSyncTableSchemaMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

export function SyncTableSchemaButton({ tableId }: { tableId: TableId }) {
  const [syncTableSchema] = useSyncTableSchemaMutation();
  const [sendToast] = useToast();
  const [started, setStarted] = useState(false);
  const timeoutIdRef = useRef<number>();

  const handleClick = async () => {
    const { error } = await syncTableSchema(tableId);

    if (error) {
      sendToast({
        icon: "warning",
        message: t`Failed to start sync`,
        toastColor: "error",
      });
    } else {
      setStarted(true);
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = window.setTimeout(() => setStarted(false), 2000);
    }
  };

  useUnmount(() => {
    window.clearTimeout(timeoutIdRef.current);
  });

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Sync triggered!` : t`Sync table schema`}
    </Button>
  );
}
