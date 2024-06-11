import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { BulkDeleteConfirmModal } from "metabase/archive/components/BulkDeleteConfirmModal";
import {
  canDeleteItem,
  canMoveItem,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { BulkActionButton } from "metabase/components/BulkActionBar";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Box } from "metabase/ui";
import type { Collection, CollectionItem } from "metabase-types/api";

type ArchivedBulkActionsProps = {
  selected: any[];
  collection: Collection;
  selectedItems: CollectionItem[] | null;
  selectedAction: string | null;
  clearSelected: () => void;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  setSelectedAction: (action: string | null) => void;
};

export const ArchivedBulkActions = ({
  selected,
  selectedItems,
  selectedAction,
  collection,
  clearSelected,
  setSelectedItems,
  setSelectedAction,
}: ArchivedBulkActionsProps) => {
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

  // restore
  const showRestore = isRootTrashCollection(collection);

  const canRestore = useMemo(() => {
    return selected.every(item => item.can_restore);
  }, [selected]);

  const handleBulkRestore = () => {
    const actions = selected.map(item => item.setArchived(false));
    Promise.all(actions).finally(() => clearSelected());
  };

  // delete
  const canDelete = useMemo(() => {
    return selected.every(item => canDeleteItem(item, collection));
  }, [selected, collection]);

  const handleBulkDeletePermanentlyStart = async () => {
    setSelectedItems(selected);
    setSelectedAction("delete");
  };

  const handleBulkDeletePermanently = async () => {
    const actions = selected.map(item => item.delete());
    Promise.all(actions).finally(() => clearSelected());
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

  // move
  const canMove = useMemo(() => {
    return selected.every(item => canMoveItem(item, collection));
  }, [selected, collection]);

  const handleBulkMoveStart = () => {
    setSelectedItems(selected);
    setSelectedAction("move");
  };

  return (
    <>
      {showRestore && (
        <BulkActionButton onClick={handleBulkRestore} disabled={!canRestore}>
          {t`Restore`}
        </BulkActionButton>
      )}
      <BulkActionButton onClick={handleBulkMoveStart} disabled={!canMove}>
        {t`Move`}
      </BulkActionButton>
      <BulkActionButton
        onClick={handleBulkDeletePermanentlyStart}
        disabled={!canDelete}
      >
        <Box c={color("danger")}>{t`Delete permanently`}</Box>
      </BulkActionButton>

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
