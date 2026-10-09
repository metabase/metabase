import { useDisclosure } from "@mantine/hooks";
import { msgid, ngettext, t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type {
  ContentDiagnosticsBaseFinding,
  ContentDiagnosticsFindingId,
} from "metabase-types/api";

import type { ContentDiagnosticsTab } from "../types";

import { useBulkTrashFindings } from "./use-bulk-trash-findings";

interface BulkTrashConfirmationOptions {
  selectedFindings: readonly ContentDiagnosticsBaseFinding[];
  tab: ContentDiagnosticsTab;
  enableTrash: boolean;
  onSettled: (
    failedFindingIds: ContentDiagnosticsFindingId[],
    settledFindingIds: ContentDiagnosticsFindingId[],
  ) => void;
}

export function useBulkTrashConfirmation({
  selectedFindings,
  tab,
  enableTrash,
  onSettled,
}: BulkTrashConfirmationOptions) {
  const dispatch = useDispatch();
  const trashFindings = useBulkTrashFindings();
  const [isConfirmOpen, { open, close }] = useDisclosure();

  const canTrash = selectedFindings.every((finding) => finding.can_write);
  const transformCount = selectedFindings.filter(
    (finding) => finding.entity_type === "transform",
  ).length;
  const archivableCount = selectedFindings.length - transformCount;
  const trashCopy = getTrashCopy(archivableCount, transformCount);

  const handleConfirm = async () => {
    if (selectedFindings.length === 0 || !enableTrash || !canTrash) {
      close();
      return;
    }
    const { total, failedFindings } = await trashFindings(
      selectedFindings,
      tab,
    );
    close();

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

    onSettled(
      failedFindings.map((finding) => finding.id),
      selectedFindings.map((finding) => finding.id),
    );
  };

  return {
    canTrash,
    actionLabel: trashCopy.actionLabel,
    open,
    confirmationProps: {
      opened: isConfirmOpen,
      title: trashCopy.title,
      message: trashCopy.message,
      confirmButtonText: trashCopy.confirmLabel,
      onConfirm: handleConfirm,
      onClose: close,
    },
  };
}

type TrashCopy = {
  actionLabel: string;
  title: string;
  message: string;
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
    message: `${trashPart} ${deletePart}`,
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
    msgid`Deleted ${count} item`,
    `Deleted ${count} items`,
    count,
  );
}
