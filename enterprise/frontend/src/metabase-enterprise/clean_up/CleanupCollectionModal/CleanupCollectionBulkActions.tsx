import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { archiveAndTrack } from "metabase/archive/analytics";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { UndoListOverlay } from "metabase/common/components/UndoListing";
import {
  useBulkArchiveStaleItemsMutation,
  useBulkUnarchiveItemsMutation,
} from "metabase-enterprise/api/collection";
import type { CollectionId } from "metabase-types/api";
import type { Undo } from "metabase-types/store/undo";

import type { ArchivedItemRef, StaleCollectionItem } from "../types";

import { BulkArchiveConfirmDialog } from "./BulkArchiveConfirmDialog";
import CS from "./CleanupCollectionBulkActions.module.css";

interface CleanupCollectionBulkActionsProps {
  selected: StaleCollectionItem[];
  total: number;
  collectionId: CollectionId;
  beforeDate: string;
  recursiveFilter: boolean;
  clearSelectedItem: () => void;
  resetPagination: () => void;
  onArchive: ({ totalArchivedItems }: { totalArchivedItems: number }) => void;
  showBulkArchiveConfirm: boolean;
  setShowBulkArchiveConfirm: (show: boolean) => void;
  hasClickedSelectAll: boolean;
}

export const CleanupCollectionBulkActions = ({
  selected,
  total,
  collectionId,
  beforeDate,
  recursiveFilter,
  clearSelectedItem,
  resetPagination,
  onArchive,
  showBulkArchiveConfirm,
  setShowBulkArchiveConfirm,
  hasClickedSelectAll,
}: CleanupCollectionBulkActionsProps) => {
  const [undo, setUndo] = useState<Undo | undefined>();
  const [archivedIds, setArchivedIds] = useState<ArchivedItemRef[]>([]);

  const [bulkArchive, { isLoading: isBulkArchiving }] =
    useBulkArchiveStaleItemsMutation();
  const [bulkUnarchive] = useBulkUnarchiveItemsMutation();

  const handleUndo = async (items: ArchivedItemRef[]) => {
    return bulkUnarchive({ items })
      .unwrap()
      .then(() => {
        resetPagination();
        setArchivedIds([]);
      })
      .finally(() => setUndo(undefined));
  };

  const handleBulkArchive = async () => {
    const actions = selected.map((item) => {
      return archiveAndTrack({
        archive: () =>
          item.setArchived
            ? item.setArchived(true, { notify: false })
            : Promise.resolve(),
        model: item.model,
        modelId: item.id,
        triggeredFrom: "cleanup_modal",
      });
    });

    Promise.allSettled(actions)
      .then((results) => {
        resetPagination();

        const successfullyArchivedItems = results
          .map((result, index) =>
            result.status === "fulfilled" ? selected[index] : undefined,
          )
          .filter((x): x is StaleCollectionItem => !!x);
        const totalArchivedItems = successfullyArchivedItems.length;

        onArchive({ totalArchivedItems });

        const id = Date.now();
        const timeoutId = setTimeout(() => {
          setUndo((undo) => (undo?.id === id ? undefined : undo));
        }, 5000) as unknown as number;

        const message = ngettext(
          msgid`${totalArchivedItems} item has been moved to the trash.`,
          `${totalArchivedItems} items have been moved to the trash.`,
          totalArchivedItems,
        );

        const archivedRefs: ArchivedItemRef[] = successfullyArchivedItems.map(
          item => ({
            id: item.id,
            model: item.model === "dataset" ? "card" : item.model,
          }),
        );
        setArchivedIds(archivedRefs);

        setUndo({
          id,
          actions: [() => handleUndo(archivedRefs)],
          icon: "check",
          canDismiss: true,
          message,
          startedAt: Date.now(),
          timeoutId,
        });
      })
      .finally(() => clearSelectedItem());
  };

  const handleBulkArchiveAll = async () => {
    try {
      const result = await bulkArchive({
        id: collectionId,
        before_date: beforeDate,
        is_recursive: recursiveFilter,
      }).unwrap();

      resetPagination();
      clearSelectedItem();
      onArchive({ totalArchivedItems: result.total_archived });

      const id = Date.now();
      const timeoutId = setTimeout(() => {
        setUndo((undo) => (undo?.id === id ? undefined : undo));
        setArchivedIds([]);
      }, 5000) as unknown as number;

      const message = ngettext(
        msgid`${result.total_archived} item has been moved to the trash.`,
        `${result.total_archived} items have been moved to the trash.`,
        result.total_archived,
      );

      setArchivedIds(result.archived_ids);
      setUndo({
        id,
        actions: [() => handleUndo(result.archived_ids)],
        icon: "check",
        canDismiss: true,
        message,
        startedAt: Date.now(),
        timeoutId,
      });
    } catch (error) {
      console.error("Failed to archive items:", error);
    } finally {
      setShowBulkArchiveConfirm(false);
    }
  };

  const actionMessage = ngettext(
    msgid`${selected.length} item selected`,
    `${selected.length} items selected`,
    selected.length,
  );

  const hasUnselectedItems = selected.length > 0 && selected.length < total;
  const showMoveAllButton = hasClickedSelectAll && hasUnselectedItems;

  return (
    <>
      <UndoListOverlay
        undos={undo ? [undo] : []}
        onUndo={() => undo?.actions?.[0]()}
        onDismiss={() => setUndo(undefined)}
      />

      <BulkArchiveConfirmDialog
        isOpen={showBulkArchiveConfirm}
        totalItems={total}
        onConfirm={handleBulkArchiveAll}
        onCancel={() => setShowBulkArchiveConfirm(false)}
        isLoading={isBulkArchiving}
      />

      <BulkActionBar
        className={CS.actionBarContainer}
        message={actionMessage}
        opened={selected.length > 0}
      >
        <BulkActionButton disabled={false} onClick={handleBulkArchive}>
          {ngettext(
            msgid`Move ${selected.length} selected item to trash`,
            `Move ${selected.length} selected items to trash`,
            selected.length,
          )}
        </BulkActionButton>
        {showMoveAllButton && (
          <BulkActionButton
            disabled={false}
            onClick={() => setShowBulkArchiveConfirm(true)}
          >
            {ngettext(
              msgid`Move all ${total} item to trash`,
              `Move all ${total} items to trash`,
              total,
            )}
          </BulkActionButton>
        )}
      </BulkActionBar>
    </>
  );
};
