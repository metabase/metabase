import { memo, useMemo } from "react";
import { msgid, ngettext } from "ttag";
import _ from "underscore";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { isTrashedCollection } from "metabase/collections/utils";
import { BulkActionBar } from "metabase/components/BulkActionBar";
import Modal from "metabase/components/Modal";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import type { Collection, CollectionItem } from "metabase-types/api";

import { ArchivedBulkActions } from "./ArchivedBulkActions";
import { UnarchivedBulkActions } from "./UnarchivedBulkActions";

type CollectionBulkActionsProps = {
  selected: any[];
  collection: Collection;
  selectedItems: CollectionItem[] | null;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  selectedAction: string | null;
  setSelectedAction: (action: string | null) => void;
  clearSelected: () => void;
};

export const CollectionBulkActions = memo(
  ({
    selected,
    collection,
    selectedItems,
    setSelectedItems,
    selectedAction,
    setSelectedAction,
    clearSelected,
  }: CollectionBulkActionsProps) => {
    const isVisible = selected.length > 0;

    const hasSelectedItems = useMemo(
      () => !!selectedItems && !_.isEmpty(selectedItems),
      [selectedItems],
    );

    const handleCloseModal = () => {
      setSelectedItems(null);
      setSelectedAction(null);
      clearSelected();
    };

    const tryOrClear = (promise: Promise<any>) =>
      promise.finally(() => clearSelected());

    const handleBulkMove = async (
      collection: Pick<Collection, "id"> & Partial<Collection>,
    ) => {
      if (selectedItems) {
        await tryOrClear(
          Promise.all(
            selectedItems.map(item => item.setCollection?.(collection)),
          ),
        );
        handleCloseModal();
      }
    };

    const actionMessage = ngettext(
      msgid`${selected.length} item selected`,
      `${selected.length} items selected`,
      selected.length,
    );

    return (
      <>
        <BulkActionBar message={actionMessage} opened={isVisible}>
          {isTrashedCollection(collection) ? (
            <ArchivedBulkActions
              collection={collection}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              selected={selected}
              clearSelected={clearSelected}
              selectedAction={selectedAction}
              setSelectedAction={setSelectedAction}
            />
          ) : (
            <UnarchivedBulkActions
              selected={selected}
              collection={collection}
              clearSelected={clearSelected}
              setSelectedItems={setSelectedItems}
              setSelectedAction={setSelectedAction}
            />
          )}
        </BulkActionBar>

        {selectedItems && hasSelectedItems && selectedAction === "copy" && (
          <Modal onClose={handleCloseModal}>
            <CollectionCopyEntityModal
              entityObject={selectedItems?.[0]}
              onClose={handleCloseModal}
              onSaved={handleCloseModal}
            />
          </Modal>
        )}

        {selectedItems && hasSelectedItems && selectedAction === "move" && (
          <BulkMoveModal
            selectedItems={selectedItems}
            onClose={handleCloseModal}
            onMove={handleBulkMove}
            initialCollectionId={
              isTrashedCollection(collection) ? "root" : collection.id
            }
          />
        )}
      </>
    );
  },
);

CollectionBulkActions.displayName = "CollectionBulkActions";
