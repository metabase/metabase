import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { UnpublishTablesModal } from "../../components/UnpublishTablesModal";

export type UnpublishTablesSelection = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
};

type UnpublishTablesProps = {
  onUnpublish?: () => void;
};

export function useUnpublishTables({ onUnpublish }: UnpublishTablesProps = {}) {
  const [selection, setSelection] = useState<UnpublishTablesSelection>();
  const [
    isUnpublishModalOpened,
    { open: openUnpublishModal, close: closeUnpublishModal },
  ] = useDisclosure();
  const { sendSuccessToast } = useMetadataToasts();

  const handleUnpublish = (selection: UnpublishTablesSelection) => {
    setSelection(selection);
    openUnpublishModal();
  };

  const handleUnpublishSuccess = () => {
    closeUnpublishModal();
    sendSuccessToast(t`Unpublished`);
    onUnpublish?.();
  };

  const unpublishModal = (
    <UnpublishTablesModal
      databaseIds={selection?.databaseIds}
      schemaIds={selection?.schemaIds}
      tableIds={selection?.tableIds}
      isOpened={isUnpublishModalOpened}
      onUnpublish={handleUnpublishSuccess}
      onClose={closeUnpublishModal}
    />
  );

  return {
    unpublishModal,
    handleUnpublish,
  };
}
