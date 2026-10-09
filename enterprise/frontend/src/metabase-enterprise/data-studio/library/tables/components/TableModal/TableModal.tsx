import { match } from "ts-pattern";
import { t } from "ttag";

import { collectionApi } from "metabase/api";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { useSetCollection } from "metabase/common/hooks/use-set-collection";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { CollectionId, CollectionItem, Table } from "metabase-types/api";

export type TableModalTable =
  | Pick<CollectionItem, "id" | "database_id" | "collection_id">
  | Pick<Table, "id" | "db_id" | "collection_id">;

export type MoveTableModalState = {
  type: "move";
  table: TableModalTable;
};

export type UnpublishTableModalState = {
  type: "unpublish";
  table: TableModalTable;
};

export type TableModalState = MoveTableModalState | UnpublishTableModalState;

type TableModalProps = {
  modal: TableModalState | undefined;
  onClose: () => void;
};

export function TableModal({ modal, onClose }: TableModalProps) {
  if (modal == null) {
    return null;
  }

  return match(modal)
    .with({ type: "move" }, ({ table }) => (
      <MoveTableModal table={table} onClose={onClose} />
    ))
    .with({ type: "unpublish" }, ({ table }) => (
      <UnpublishTableModal table={table} onClose={onClose} />
    ))
    .exhaustive();
}

type MoveTableModalProps = {
  table: TableModalTable;
  onClose: () => void;
};

function MoveTableModal({ table, onClose }: MoveTableModalProps) {
  const dispatch = useDispatch();
  const setCollection = useSetCollection();

  const handleMove = async (newCollection: { id: CollectionId }) => {
    const sourceCollectionId = table.collection_id;
    await setCollection(
      { model: "table", id: table.id },
      { id: newCollection.id },
      { notify: false },
    );
    dispatch(
      collectionApi.util.invalidateTags([
        { type: "collection", id: `${sourceCollectionId}-items` },
        { type: "collection", id: `${newCollection.id}-items` },
      ]),
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

type UnpublishTableModalProps = {
  table: TableModalTable;
  onClose: () => void;
};

function UnpublishTableModal({ table, onClose }: UnpublishTableModalProps) {
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
