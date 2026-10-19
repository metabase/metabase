import { useLatest } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { useSetCollection } from "metabase/common/hooks/use-set-collection";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { CollectionId, CollectionItem, Table } from "metabase-types/api";

export type TableModalTable =
  | Pick<CollectionItem, "id" | "database_id" | "collection_id">
  | Pick<Table, "id" | "db_id" | "collection_id">;

type MoveTableModalState = {
  type: "move";
  table: TableModalTable;
};

type UnpublishTableModalState = {
  type: "unpublish";
  table: TableModalTable;
};

export type TableModalState = MoveTableModalState | UnpublishTableModalState;

type TableModalProps = {
  modal: TableModalState | undefined;
  onClose: () => void;
};

export function TableModal({ modal, onClose }: TableModalProps) {
  const currentModalRef = useLatest(modal);

  if (modal === undefined) {
    return null;
  }

  const handleClose = () => {
    if (currentModalRef.current === modal) {
      onClose();
    }
  };

  return match(modal)
    .with({ type: "move" }, ({ table }) => (
      <MoveTableModal table={table} onClose={handleClose} />
    ))
    .with({ type: "unpublish" }, ({ table }) => (
      <UnpublishTableModal table={table} onClose={handleClose} />
    ))
    .exhaustive();
}

type TableModalContentProps = {
  table: TableModalTable;
  onClose: () => void;
};

function MoveTableModal({ table, onClose }: TableModalContentProps) {
  const setCollection = useSetCollection();

  const handleMove = async (newCollection: { id: CollectionId }) => {
    await setCollection(
      { model: "table", id: table.id },
      { id: newCollection.id },
      { notify: false },
    );
    onClose();
  };

  return (
    <CollectionPickerModal
      title={t`Move table to…`}
      value={{
        id: table.collection_id ?? "root",
        model: "collection",
      }}
      onChange={handleMove}
      onClose={onClose}
      options={{
        hasLibrary: true,
        hasRootCollection: false,
        hasPersonalCollections: false,
        hasSearch: true,
        hasRecents: false,
        hasConfirmButtons: true,
        confirmButtonText: t`Move`,
      }}
      entityType="table"
    />
  );
}

function UnpublishTableModal({ table, onClose }: TableModalContentProps) {
  const navigate = useNavigate();

  const handleUnpublish = () => {
    onClose();
    navigate(Urls.dataStudioLibrary());
  };

  return (
    <PLUGIN_LIBRARY.UnpublishTablesModal
      isOpened
      tableIds={[table.id]}
      onUnpublish={handleUnpublish}
      onClose={onClose}
    />
  );
}
