import { useMemo, memo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import {
  isTrashedCollection,
  canArchiveItem,
  canMoveItem,
} from "metabase/collections/utils";
import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import { Box, Transition } from "metabase/ui";
import type { Collection, CollectionItem } from "metabase-types/api";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import type {
  OnArchive,
  OnCopyWithoutArguments,
  OnMoveWithOneItem,
} from "../types";

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

  // archive / restore
  const canArchive = useMemo(() => {
    return selected.every(item => canArchiveItem(item, collection));
  }, [selected, collection]);

  const handleBulkArchive = async (archived: boolean) => {
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
        message:
          selected.length > 1
            ? t`${selected.length} items have been permanently deleted.`
            : t`Item has been permanently deleted.`,
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
                  <CardButton
                    medium
                    purple
                    onClick={handleBulkDeletePermanentlyStart}
                  >
                    <Box c={color("danger")}>{t`Delete permanently`}</Box>
                  </CardButton>
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
                      onClick={() => handleBulkArchive(true)}
                    >{t`Archive`}</CardButton>
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
          initialCollectionId={collection.id}
        />
      )}

      {hasSelectedItems && selectedAction === "delete" && (
        <Modal onClose={handleCloseModal}>
          <ConfirmContent
            cancelButtonText={t`Cancel`}
            confirmButtonText={t`Delete permanently`}
            data-testid="leave-confirmation"
            message={t`This can't be undone.`}
            title={
              selectedItemCount > 1
                ? t`Delete ${selectedItemCount} items permanently?`
                : t`Delete item permanently?`
            }
            onAction={handleBulkDeletePermanently}
            onCancel={handleCloseModal}
            onClose={handleCloseModal}
          />
        </Modal>
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export default memo(BulkActions);
