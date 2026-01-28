import { t } from "ttag";

import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import { useSyncTablesSchemasMutation } from "metabase-enterprise/api";
import { trackDataStudioTableSchemaSyncStarted } from "metabase-enterprise/data-studio/analytics";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

interface Props {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
}

export function SyncTableSchemaButton({
  databaseIds,
  schemaIds,
  tableIds,
}: Props) {
  const [syncTablesSchemas] = useSyncTablesSchemasMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const { sendErrorToast } = useMetadataToasts();

  const isSingleTable =
    (databaseIds == null || databaseIds.length === 0) &&
    (schemaIds == null || schemaIds.length === 0) &&
    tableIds != null &&
    tableIds.length === 1;

  const handleClick = async () => {
    const { error } = await syncTablesSchemas({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    });

    if (error) {
      sendErrorToast(t`Failed to start sync`);
      trackDataStudioTableSchemaSyncStarted("failure");
    } else {
      setStarted(true);
      trackDataStudioTableSchemaSyncStarted("success");
    }
  };

  return (
    <Button variant="default" onClick={handleClick}>
      {started
        ? t`Sync triggered!`
        : isSingleTable
          ? t`Sync table schema`
          : t`Sync table schemas`}
    </Button>
  );
}
