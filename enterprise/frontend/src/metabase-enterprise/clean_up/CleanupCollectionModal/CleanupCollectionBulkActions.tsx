import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { archiveAndTrack } from "metabase/archive/analytics";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/components/BulkActionBar";
import { UndoListOverlay, UndoToast } from "metabase/containers/UndoListing";
import type { CollectionItem } from "metabase-types/api";
import type { Undo } from "metabase-types/store/undo";

import type { StaleCollectionItem } from "../types";

import CS from "./CleanupCollectionBulkActions.module.css";

interface CleanupCollectionBulkActionsProps {
  selected: StaleCollectionItem[];
  clearSelectedItem: () => void;
  resetPagination: () => void;
  onArchive: ({ totalArchivedItems }: { totalArchivedItems: number }) => void;
}

export const CleanupCollectionBulkActions = ({
  selected,
  clearSelectedItem,
  resetPagination,
  onArchive,
}: CleanupCollectionBulkActionsProps) => {
  const [undo, setUndo] = useState<Undo | undefined>();

  const handleUndo = async (items: CollectionItem[]) => {
    return Promise.all(
      items.map(item => item?.setArchived?.(false, { notify: false })),
    )
      .then(() => resetPagination())
      .finally(() => setUndo(undefined));
  };

  const handleBulkArchive = async () => {
    const actions = selected.map(item => {
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
      .then(results => {
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
          setUndo(undo => (undo?.id === id ? undefined : undo));
        }, 5000) as unknown as number;

        const message = ngettext(
          msgid`${totalArchivedItems} item has been moved to the trash.`,
          `${totalArchivedItems} items have been moved to the trash.`,
          totalArchivedItems,
        );

        setUndo({
          id,
          actions: [() => handleUndo(successfullyArchivedItems)],
          icon: "check",
          canDismiss: true,
          message,
          startedAt: Date.now(),
          timeoutId,
        });
      })
      .finally(() => clearSelectedItem());
  };

  const actionMessage = ngettext(
    msgid`${selected.length} item selected`,
    `${selected.length} items selected`,
    selected.length,
  );

  return (
    <>
      {undo && (
        <UndoListOverlay>
          <UndoToast
            undo={undo}
            onUndo={() => undo.actions?.[0]()}
            onDismiss={() => setUndo(undefined)}
          />
        </UndoListOverlay>
      )}

      <BulkActionBar
        className={CS.actionBarContainer}
        message={actionMessage}
        opened={selected.length > 0}
      >
        <BulkActionButton
          disabled={false}
          onClick={handleBulkArchive}
        >{t`Move to trash`}</BulkActionButton>
      </BulkActionBar>
    </>
  );
};
