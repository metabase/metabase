import { useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/components/BulkActionBar";
import { UndoToast } from "metabase/containers/UndoListing";
import type { CollectionItem } from "metabase-types/api";
import type { Undo } from "metabase-types/store/undo";

import CS from "./CleanupCollectionBulkActions.module.css";

interface CleanupCollectionBulkActionsProps {
  selected: CollectionItem[];
  clearSelectedItem: () => void;
  resetPagination: () => void;
}

export const CleanupCollectionBulkActions = ({
  selected,
  clearSelectedItem,
  resetPagination,
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
    const actions = selected.map(item =>
      item?.setArchived?.(true, { notify: false }),
    );

    Promise.all(actions)
      .then(() => {
        resetPagination();

        const id = Date.now();
        const timeoutId = setTimeout(() => {
          setUndo(undo => (undo?.id === id ? undefined : undo));
        }, 5000) as unknown as number;

        const message = ngettext(
          msgid`${selected.length} item has been moved to the trash.`,
          `${selected.length} items have been moved to the trash.`,
          selected.length,
        );

        setUndo({
          id,
          actions: [() => handleUndo(selected)],
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
        <div className={CS.undoContainer} data-testid="undo-list">
          <UndoToast
            undo={undo}
            onUndo={() => undo.actions?.[0]()}
            onDismiss={() => setUndo(undefined)}
          />
        </div>
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
