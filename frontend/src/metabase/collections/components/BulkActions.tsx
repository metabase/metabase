import { useMemo, memo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { BulkDeleteConfirmModal } from "metabase/archive/components/BulkDeleteConfirmModal";
import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import {
  isTrashedCollection,
  canArchiveItem,
  canUnarchiveItem,
  canDeleteItem,
  canMoveItem,
  isRootTrashCollection,
} from "metabase/collections/utils";
import Modal from "metabase/components/Modal";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Box, Transition } from "metabase/ui";
import type { Collection, CollectionItem } from "metabase-types/api";

import {
  BulkActionsToast,
  CardButton,
  CardSide,
  ToastCard,
} from "./BulkActions.styled";

const slideIn = {
  in: { opacity: 1, transform: "translate(-50%, 0)" },
  out: { opacity: 0, transform: "translate(-50%, 100px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

type BulkActionsProps = {
  selected: any[];
  collection: Collection;
  selectedItems: CollectionItem[] | null;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  selectedAction: string | null;
  setSelectedAction: (action: string | null) => void;
  clearSelected: () => void;
  isNavbarOpen: boolean;
};

const BulkActions = ({
  collection,
  selected,
  clearSelected,
  selectedItems,
  setSelectedItems,
  selectedAction,
  setSelectedAction,
  isNavbarOpen,
}: BulkActionsProps) => {
  const dispatch = useDispatch();

  const hasSelectedItems = useMemo(
    () => !!selectedItems && !_.isEmpty(selectedItems),
    [selectedItems],
  );

  const selectedItemCount = selectedItems?.length ?? 0;

  const handleCloseModal = () => {
    setSelectedItems(null);
    setSelectedAction(null);
    clearSelected();
  };

  // move
  const canMove = useMemo(() => {
    return selected.every(item => canMoveItem(item, collection));
  }, [selected, collection]);

  const handleBulkMoveStart = () => {
    setSelectedItems(selected);
    setSelectedAction("move");
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

  const canArchive = useMemo(() => {
    return selected.every(item => canArchiveItem(item, collection));
  }, [selected, collection]);

  const showUnarchive = isRootTrashCollection(collection);

  const canUnarchive = useMemo(() => {
    return selected.every(item => canUnarchiveItem(item, collection));
  }, [selected, collection]);

  const canDelete = useMemo(() => {
    return selected.every(item => canDeleteItem(item, collection));
  }, [selected, collection]);

  const handleBulkSetArchive = async (archived: boolean) => {
    await tryOrClear(
      Promise.all(selected.map(item => item.setArchived(archived))),
    );
  };

  // delete
  const handleBulkDeletePermanentlyStart = async () => {
    setSelectedItems(selected);
    setSelectedAction("delete");
  };

  const handleBulkDeletePermanently = async () => {
    await tryOrClear(Promise.all(selected.map(item => item.delete())));
    dispatch(
      addUndo({
        icon: "check",
        message: ngettext(
          msgid`${selected.length} item has been permanently deleted.`,
          `${selected.length} items have been permanently deleted.`,
          selected.length,
        ),
        undo: false,
        canDismiss: true,
      }),
    );
  };

  return (
    <>
      <Transition
        mounted={selected.length > 0}
        transition={slideIn}
        duration={400}
        timingFunction="ease"
      >
        {styles => (
          <BulkActionsToast style={styles} isNavbarOpen={isNavbarOpen}>
            <ToastCard dark data-testid="toast-card">
              <CardSide>
                {ngettext(
                  msgid`${selected.length} item selected`,
                  `${selected.length} items selected`,
                  selected.length,
                )}
              </CardSide>
              <CardSide>
                {isTrashedCollection(collection) ? (
                  <>
                    {showUnarchive && (
                      <CardButton
                        medium
                        purple
                        onClick={() => handleBulkSetArchive(false)}
                        disabled={!canUnarchive}
                      >
                        {t`Restore`}
                      </CardButton>
                    )}
                    <CardButton
                      medium
                      purple
                      onClick={handleBulkMoveStart}
                      disabled={!canMove}
                    >
                      {t`Move`}
                    </CardButton>
                    <CardButton
                      medium
                      purple
                      onClick={handleBulkDeletePermanentlyStart}
                      disabled={!canDelete}
                    >
                      <Box c={color("danger")}>{t`Delete permanently`}</Box>
                    </CardButton>
                  </>
                ) : (
                  <>
                    <CardButton
                      medium
                      purple
                      disabled={!canMove}
                      onClick={handleBulkMoveStart}
                    >{t`Move`}</CardButton>
                    <CardButton
                      medium
                      purple
                      disabled={!canArchive}
                      onClick={() => handleBulkSetArchive(true)}
                    >{t`Move to trash`}</CardButton>
                  </>
                )}
              </CardSide>
            </ToastCard>
          </BulkActionsToast>
        )}
      </Transition>

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

      {hasSelectedItems && selectedAction === "delete" && (
        <BulkDeleteConfirmModal
          selectedItemCount={selectedItemCount}
          onCloseModal={handleCloseModal}
          onBulkDeletePermanently={handleBulkDeletePermanently}
        />
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export default memo(BulkActions);
