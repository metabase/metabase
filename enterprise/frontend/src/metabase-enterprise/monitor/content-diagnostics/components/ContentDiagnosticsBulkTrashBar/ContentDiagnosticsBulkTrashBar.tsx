import { type ReactNode, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { List } from "metabase/ui";
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";

import { useBulkTrashFindings } from "./use-bulk-trash-findings";

type ContentDiagnosticsBulkTrashBarProps = {
  selectedFindings: ContentDiagnosticsBaseFinding[];
  onSettled: (failedFindingIds: number[]) => void;
};

type TrashCopy = {
  actionLabel: string;
  title: string;
  message: ReactNode;
  confirmLabel: string;
};

// Transforms are permanently deleted (no restore), so any selection that includes
// one drops the "trash" language for "delete". A pure-archivable selection keeps
// the recoverable "move to trash" wording (matching the collections screen).
function getTrashCopy(
  archivableCount: number,
  transformCount: number,
): TrashCopy {
  if (transformCount === 0) {
    return {
      actionLabel: t`Move to trash`,
      title: ngettext(
        msgid`Move ${archivableCount} item to trash?`,
        `Move ${archivableCount} items to trash?`,
        archivableCount,
      ),
      message: t`You can restore items from the trash.`,
      confirmLabel: t`Move to trash`,
    };
  }

  const deletePart = ngettext(
    msgid`${transformCount} transform will be permanently deleted and cannot be restored.`,
    `${transformCount} transforms will be permanently deleted and cannot be restored.`,
    transformCount,
  );

  if (archivableCount === 0) {
    return {
      actionLabel: t`Delete`,
      title: ngettext(
        msgid`Delete ${transformCount} transform?`,
        `Delete ${transformCount} transforms?`,
        transformCount,
      ),
      message: deletePart,
      confirmLabel: t`Delete`,
    };
  }

  const trashPart = ngettext(
    msgid`${archivableCount} item will be moved to the trash and can be restored later.`,
    `${archivableCount} items will be moved to the trash and can be restored later.`,
    archivableCount,
  );
  return {
    actionLabel: t`Delete`,
    title: t`Delete selected items?`,
    message: (
      <List>
        <List.Item>{trashPart}</List.Item>
        <List.Item>{deletePart}</List.Item>
      </List>
    ),
    confirmLabel: t`Delete`,
  };
}

function getResultMessage(count: number, transformCount: number): string {
  if (transformCount === 0) {
    return ngettext(
      msgid`Moved ${count} item to the trash`,
      `Moved ${count} items to the trash`,
      count,
    );
  }
  return ngettext(
    msgid`Removed ${count} item`,
    `Removed ${count} items`,
    count,
  );
}

export function ContentDiagnosticsBulkTrashBar({
  selectedFindings,
  onSettled,
}: ContentDiagnosticsBulkTrashBarProps) {
  const dispatch = useDispatch();
  const trashFindings = useBulkTrashFindings();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const count = selectedFindings.length;
  const transformCount = selectedFindings.filter(
    (finding) => finding.entity_type === "transform",
  ).length;
  const archivableCount = count - transformCount;
  const trashCopy = getTrashCopy(archivableCount, transformCount);

  const handleConfirm = async () => {
    const { total, failedFindings } = await trashFindings(selectedFindings);
    setIsConfirmOpen(false);

    if (failedFindings.length > 0) {
      dispatch(
        addUndo({
          icon: "warning",
          message: ngettext(
            msgid`Couldn't remove ${failedFindings.length} item`,
            `Couldn't remove ${failedFindings.length} items`,
            failedFindings.length,
          ),
        }),
      );
    } else {
      dispatch(addUndo({ message: getResultMessage(total, transformCount) }));
    }

    onSettled(failedFindings.map((finding) => finding.id));
  };

  return (
    <>
      <BulkActionBar
        opened={count > 0}
        message={ngettext(
          msgid`${count} item selected`,
          `${count} items selected`,
          count,
        )}
      >
        <BulkActionButton danger onClick={() => setIsConfirmOpen(true)}>
          {trashCopy.actionLabel}
        </BulkActionButton>
      </BulkActionBar>
      <ConfirmModal
        opened={isConfirmOpen}
        title={trashCopy.title}
        message={trashCopy.message}
        confirmButtonText={trashCopy.confirmLabel}
        onConfirm={handleConfirm}
        onClose={() => setIsConfirmOpen(false)}
      />
    </>
  );
}
