import { memo, useMemo, useState } from "react";
import { msgid, ngettext } from "ttag";
import _ from "underscore";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { isTrashedCollection } from "metabase/collections/utils";
import { BulkActionBar } from "metabase/components/BulkActionBar";
import Modal from "metabase/components/Modal";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import type { Collection, CollectionItem } from "metabase-types/api";

import { ArchivedBulkActions } from "./ArchivedBulkActions";
import {
  type Destination,
  QuestionMoveConfirmModal,
} from "./QuestionMoveConfirmModal";
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
    const [rememberedDestination, setRememberedDestination] =
      useState<Destination | null>(null);

    const isVisible = selected.length > 0 && selectedAction !== "confirm-move";

    const hasSelectedItems = useMemo(
      () => !!selectedItems && !_.isEmpty(selectedItems),
      [selectedItems],
    );

    const handleCloseModal = () => {
      setSelectedItems(null);
      setSelectedAction(null);
      setRememberedDestination(null);
      clearSelected();
    };

    const tryOrClear = (promise: Promise<any>) =>
      promise.finally(() => clearSelected());

    const handleConfirmedBulkQuestionMove = async () => {
      if (rememberedDestination) {
        handleCloseModal();
        await doMove(rememberedDestination);
      }
    };

    const doMove = async (destination: Destination) => {
      if (selectedItems) {
        await tryOrClear(
          Promise.all(
            selectedItems.map(item => item.setCollection?.(destination)),
          ),
        );
      }
      handleCloseModal();
    };

    const handleBulkMove = async (destination: Destination) => {
      if (selectedItems) {
        // If the destination is a collection, then move the items
        if (destination.model === "collection") {
          await doMove(destination);
        }

        // otherwise, destination is a dashboard
        else if (destination.model === "dashboard") {
          // ensure that all selected items are cards. This should be enforced by the picker
          if (!selectedItems.every(item => item.model === "card")) {
            throw new Error("can't move non-cards into dashboards");
          }
          //determine if we need to display a confirmation modal

          //Check how many items are cards that appear in a dashboard
          const potentialConfirmCards = selectedItems.filter(
            item => item.dashboard_count && item.dashboard_count > 0,
          );

          //If there are none, then do the move
          if (potentialConfirmCards.length === 0) {
            await doMove(destination);
          }

          //Otherwise, get the names of the affected dashboards and display the modal
          else {
            setRememberedDestination(destination);
            setSelectedAction("confirm-move");
          }
        }
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

        {hasSelectedItems && selectedAction === "confirm-move" && (
          <QuestionMoveConfirmModal
            selectedItems={selectedItems || []}
            onConfirm={handleConfirmedBulkQuestionMove}
            onClose={handleCloseModal}
            destination={rememberedDestination}
          />
        )}
      </>
    );
  },
);

CollectionBulkActions.displayName = "CollectionBulkActions";
