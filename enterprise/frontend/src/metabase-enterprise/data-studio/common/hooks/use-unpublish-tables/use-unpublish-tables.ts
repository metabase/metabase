import { msgid, ngettext, t } from "ttag";

import { useConfirmation } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useUnpublishTablesMutation } from "metabase-enterprise/api";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

export type UseUnpublishTablesRequest = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
};

export function useUnpublishTables() {
  const [unpublishTables] = useUnpublishTablesMutation();
  const { show: showModal, modalContent } = useConfirmation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleUnpublish = (input: UseUnpublishTablesRequest) => {
    showModal({
      title: getTitle(input),
      message: getMessage(input),
      confirmButtonText: t`Unpublish`,
      onConfirm: async () => {
        const { error } = await unpublishTables({
          database_ids: input.databaseIds,
          schema_ids: input.schemaIds,
          table_ids: input.schemaIds,
        });
        if (error) {
          sendErrorToast(t`Failed to unpublish tables`);
        } else {
          sendSuccessToast(t`Unpublished`);
        }
      },
    });
  };

  return { unpublishConfirmationModal: modalContent, handleUnpublish };
}

function getTitle({
  databaseIds = [],
  schemaIds = [],
  tableIds = [],
}: UseUnpublishTablesRequest) {
  if (databaseIds.length === 0 && schemaIds.length === 0) {
    return ngettext(
      msgid`Unpublish this table?`,
      `Unpublish these ${tableIds.length} tables?`,
      tableIds.length,
    );
  }
  return t`Unpublish these tables?`;
}

function getMessage({
  databaseIds = [],
  schemaIds = [],
  tableIds = [],
}: UseUnpublishTablesRequest) {
  if (
    databaseIds.length === 0 &&
    schemaIds.length === 0 &&
    tableIds.length === 1
  ) {
    return t`This will remove this table from the Library. Any queries that use this table will still work.`;
  }

  return t`This will remove these tables from the Library. Any queries that use these tables will still work.`;
}
