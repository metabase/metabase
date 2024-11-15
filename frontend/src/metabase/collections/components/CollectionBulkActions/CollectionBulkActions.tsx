import { memo, useMemo, useState } from "react";
import { msgid, ngettext } from "ttag";
import _ from "underscore";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import {
  getAffectedDashboardsFromMove,
  isTrashedCollection,
} from "metabase/collections/utils";
import { BulkActionBar } from "metabase/components/BulkActionBar";
import Modal from "metabase/components/Modal";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import { useDispatch } from "metabase/lib/redux";
import type { Collection, CollectionItem, Dashboard } from "metabase-types/api";

import { ArchivedBulkActions } from "./ArchivedBulkActions";
import { QuestionMoveConfirmModal } from "./QuestionMoveConfirmModal";
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

type Destination =
  | (Pick<Collection, "id"> & { model: "collection" })
  | (Pick<Dashboard, "id"> & { model: "dashboard" });

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
    const dispatch = useDispatch();
    const [selectedCards, setSelectedCards] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
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
      setSelectedCards([]);
      clearSelected();
    };

    const tryOrClear = (promise: Promise<any>) =>
      promise.finally(() => clearSelected());

    const handleConfirmedBulkQuestionMove = async () => {
      if (rememberedDestination) {
        await doMove(rememberedDestination);
        handleCloseModal();
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
          //determine if we need to display a confirmation modal

          //Check how many items are cards that appear in a dashboard
          const potentialConfirmCards = selectedItems.filter(
            item =>
              item.model === "card" &&
              item.dashboard_count &&
              item.dashboard_count > 0,
          );

          //If there are none, then do the move
          if (potentialConfirmCards.length === 0) {
            await doMove(destination);
          }

          //Otherwise, get the names of the affected dashboards and display the modal
          else {
            setSelectedAction("confirm-move");
            setIsLoading(true);
            const cardDashboards = await getAffectedDashboardsFromMove(
              potentialConfirmCards,
              destination,
              dispatch,
            );
            setIsLoading(false);

            // If after all the processing, we determine there are affected dashboards,
            // Set the state to show the info modal.
            if (cardDashboards.length > 0) {
              setSelectedCards(cardDashboards);
              setRememberedDestination(destination);
            }
            //If no dashboards are actually affected, then do the move without a confirmation modal
            else {
              setSelectedAction(null);
              await doMove(destination);
            }
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

        <QuestionMoveConfirmModal
          cardDashboards={selectedCards}
          selectedItems={selectedItems || []}
          onConfirm={handleConfirmedBulkQuestionMove}
          onClose={handleCloseModal}
          isLoading={isLoading}
        />
      </>
    );
  },
);

CollectionBulkActions.displayName = "CollectionBulkActions";
