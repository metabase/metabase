import { t } from "ttag";

import {
  useDiscardTablesFieldValuesMutation,
  useRescanTablesFieldValuesMutation,
  useSyncTablesSchemasMutation,
} from "metabase/api";
import {
  trackDataStudioTableFieldValuesDiscardStarted,
  trackDataStudioTableFieldsRescanStarted,
  trackDataStudioTableSchemaSyncStarted,
} from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/common/hooks";
import type { Table } from "metabase-types/api";

/** Re-sync a table's schema, re-scan its field values, or discard them, with toasts */
export function useTableSyncActions(table: Table) {
  const [syncTablesSchemas] = useSyncTablesSchemasMutation();
  const [rescanTablesFieldValues] = useRescanTablesFieldValuesMutation();
  const [discardTablesFieldValues] = useDiscardTablesFieldValuesMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const tableIds = [table.id];

  const syncSchema = async () => {
    const { error } = await syncTablesSchemas({ table_ids: tableIds });
    if (error) {
      sendErrorToast(t`Failed to start sync`);
      trackDataStudioTableSchemaSyncStarted("failure");
    } else {
      sendSuccessToast(t`Sync triggered`);
      trackDataStudioTableSchemaSyncStarted("success");
    }
  };

  const rescanFieldValues = async () => {
    const { error } = await rescanTablesFieldValues({ table_ids: tableIds });
    if (error) {
      sendErrorToast(t`Failed to start scan`);
      trackDataStudioTableFieldsRescanStarted("failure");
    } else {
      sendSuccessToast(t`Scan triggered`);
      trackDataStudioTableFieldsRescanStarted("success");
    }
  };

  const discardFieldValues = async () => {
    const { error } = await discardTablesFieldValues({ table_ids: tableIds });
    if (error) {
      sendErrorToast(t`Failed to discard values`);
      trackDataStudioTableFieldValuesDiscardStarted("failure");
    } else {
      sendSuccessToast(t`Discard triggered`);
      trackDataStudioTableFieldValuesDiscardStarted("success");
    }
  };

  return { syncSchema, rescanFieldValues, discardFieldValues };
}
