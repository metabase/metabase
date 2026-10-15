import { memo, useCallback, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { moveCollectionItemAndTrack } from "metabase/common/collections/analytics";
import {
  type Destination,
  QuestionMoveConfirmModal,
} from "metabase/common/collections/components/QuestionMoveConfirmModal";
import { isTrashedCollection } from "metabase/common/collections/utils";
import { BulkActionBar } from "metabase/common/components/BulkActionBar";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { BulkMoveModal } from "metabase/common/components/Pickers/MoveModal/MoveModal";
import {
  canMoveItem,
  isMovable,
  useSetCollection,
} from "metabase/common/hooks";
import {
  type RegisterShortcutProps,
  useRegisterShortcut,
} from "metabase/palette/hooks/useRegisterShortcut";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import { ArchivedBulkActions } from "./ArchivedBulkActions";
import { UnarchivedBulkActions } from "./UnarchivedBulkActions";
import { useBulkArchive } from "./use-bulk-archive";

const BLOCKING_OVERLAY_SELECTOR =
  '[role="dialog"], [data-element-id="mantine-popover"]';

function hasBlockingOverlay() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(BLOCKING_OVERLAY_SELECTOR),
  ).some((element) => element.style.display !== "none");
}

type CollectionBulkActionsProps = {
  selected: CollectionItem[];
  collection: Collection;
  bookmarks?: Bookmark[];
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
    bookmarks,
    selectedItems,
    setSelectedItems,
    selectedAction,
    setSelectedAction,
    clearSelected,
  }: CollectionBulkActionsProps) => {
    const [rememberedDestination, setRememberedDestination] =
      useState<Destination | null>(null);
    const setCollection = useSetCollection();
    const { canArchive, archiveSelected } = useBulkArchive(
      selected,
      collection,
    );
    const isTrashed = isTrashedCollection(collection);
    const isTrashConfirmOpen = selectedAction === "trash";
    const openTrashConfirm = useCallback(
      () => setSelectedAction("trash"),
      [setSelectedAction],
    );
    const closeTrashConfirm = useCallback(
      () => setSelectedAction(null),
      [setSelectedAction],
    );

    const hasBlockingDialog = selectedAction !== null;

    const canRunSelectionShortcut = useCallback(() => {
      return selected.length > 0 && !hasBlockingDialog && !hasBlockingOverlay();
    }, [hasBlockingDialog, selected.length]);

    const handleTrashShortcut = useCallback(() => {
      if (canRunSelectionShortcut() && canArchive) {
        openTrashConfirm();
      }
    }, [canArchive, canRunSelectionShortcut, openTrashConfirm]);

    const handleClearSelectionShortcut = useCallback(() => {
      if (canRunSelectionShortcut()) {
        clearSelected();
      }
    }, [canRunSelectionShortcut, clearSelected]);

    useBulkActionsShortcuts(
      handleTrashShortcut,
      handleClearSelectionShortcut,
      isTrashed,
    );

    const handleConfirmTrash = async () => {
      closeTrashConfirm();
      try {
        await archiveSelected();
      } finally {
        clearSelected();
      }
    };

    const isVisible = selected.length > 0 && selectedAction !== "confirm-move";

    const hasSelectedItems = selectedItems !== null && selectedItems.length > 0;
    const canMove = useMemo(
      () => selected.every((item) => canMoveItem(item, collection)),
      [selected, collection],
    );

    const handleBulkMoveStart = useCallback(() => {
      setSelectedItems([...selected]);
      setSelectedAction("move");
    }, [selected, setSelectedAction, setSelectedItems]);

    const handleCloseModal = () => {
      setSelectedItems(null);
      setSelectedAction(null);
      setRememberedDestination(null);
      clearSelected();
    };

    const handleCancelModal = () => {
      setSelectedItems(null);
      setSelectedAction(null);
      setRememberedDestination(null);
    };

    const handleConfirmedBulkQuestionMove = async () => {
      if (rememberedDestination) {
        handleCloseModal();
        await doMove(rememberedDestination);
      }
    };

    const doMove = async (destination: Destination) => {
      if (selectedItems) {
        await Promise.all(
          selectedItems.filter(isMovable).map((item) =>
            moveCollectionItemAndTrack({
              item,
              move: () => setCollection(item, destination),
              triggeredFrom: "move_modal",
            }),
          ),
        ).finally(clearSelected);
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
          if (!selectedItems.every((item) => item.model === "card")) {
            throw new Error("can't move non-cards into dashboards");
          }
          //determine if we need to display a confirmation modal

          //Check how many items are cards that appear in a dashboard
          const potentialConfirmCards = selectedItems.filter(
            (item) => item.dashboard_count && item.dashboard_count > 0,
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

    // This is a little cheeky, but by virtue of the screens we show the BulkMoveModal, all
    // selected items should have the same collection id. yatta!
    const recentAndSearchFilter = (item: OmniPickerItem) =>
      item.model === "collection" && item.id === collection.id;

    return (
      <>
        <BulkActionBar message={actionMessage} opened={isVisible}>
          {isTrashed ? (
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
              bookmarks={bookmarks ?? []}
              clearSelected={clearSelected}
              onRequestMove={canMove ? handleBulkMoveStart : undefined}
              onRequestTrash={canArchive ? openTrashConfirm : undefined}
            />
          )}
        </BulkActionBar>

        <ConfirmModal
          opened={isTrashConfirmOpen}
          data-testid="move-to-trash-confirmation"
          title={ngettext(
            msgid`Move ${selected.length} item to trash?`,
            `Move ${selected.length} items to trash?`,
            selected.length,
          )}
          message={t`You can restore items from the trash.`}
          confirmButtonText={t`Move to trash`}
          onConfirm={handleConfirmTrash}
          onClose={closeTrashConfirm}
        />

        {hasSelectedItems && selectedAction === "copy" && (
          <CollectionCopyEntityModal
            entityObject={selectedItems[0]}
            onClose={handleCloseModal}
            onSaved={handleCloseModal}
          />
        )}

        {hasSelectedItems && selectedAction === "move" && (
          <BulkMoveModal
            selectedItems={selectedItems}
            onClose={handleCancelModal}
            onMove={handleBulkMove}
            initialCollectionId={isTrashed ? "root" : collection.id}
            recentAndSearchFilter={recentAndSearchFilter}
          />
        )}

        {hasSelectedItems && selectedAction === "confirm-move" && (
          <QuestionMoveConfirmModal
            selectedItems={selectedItems}
            onConfirm={handleConfirmedBulkQuestionMove}
            onClose={handleCloseModal}
            destination={rememberedDestination}
          />
        )}
      </>
    );
  },
);

function useBulkActionsShortcuts(
  handleTrashShortcut: () => void,
  handleClearSelectionShortcut: () => void,
  isTrashed: boolean,
) {
  const shortcutsToRegister: RegisterShortcutProps[] = useMemo(() => {
    const shortcuts: RegisterShortcutProps[] = [
      {
        id: "collection-clear-selection",
        perform: handleClearSelectionShortcut,
      },
    ];

    if (!isTrashed) {
      shortcuts.push({
        id: "collection-send-items-to-trash",
        perform: handleTrashShortcut,
      });
    }

    return shortcuts;
  }, [handleClearSelectionShortcut, handleTrashShortcut, isTrashed]);

  useRegisterShortcut(shortcutsToRegister, [shortcutsToRegister]);
}

CollectionBulkActions.displayName = "CollectionBulkActions";
