import { type ReactNode, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  BulkActionBar,
  BulkActionDangerButton,
} from "metabase/common/components/BulkActionBar";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { List } from "metabase/ui";
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";

import { useBulkTrashFindings } from "./use-bulk-trash-findings";

type ContentDiagnosticsBulkTrashBarProps = {
  selectedFindings: ContentDiagnosticsBaseFinding[];
  onClear: () => void;
  onTrashed: () => void;
};

function getConfirmMessage(
  archivableCount: number,
  transformCount: number,
): ReactNode {
  const trashPart = ngettext(
    msgid`${archivableCount} item will be moved to the trash and can be restored later.`,
    `${archivableCount} items will be moved to the trash and can be restored later.`,
    archivableCount,
  );
  const deletePart = ngettext(
    msgid`${transformCount} transform will be permanently deleted and cannot be restored.`,
    `${transformCount} transforms will be permanently deleted and cannot be restored.`,
    transformCount,
  );

  if (transformCount === 0) {
    return trashPart;
  }
  if (archivableCount === 0) {
    return deletePart;
  }
  return (
    <List>
      <List.Item>{trashPart}</List.Item>
      <List.Item>{deletePart}</List.Item>
    </List>
  );
}

export function ContentDiagnosticsBulkTrashBar({
  selectedFindings,
  onClear,
  onTrashed,
}: ContentDiagnosticsBulkTrashBarProps) {
  const dispatch = useDispatch();
  const trashFindings = useBulkTrashFindings();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const count = selectedFindings.length;
  const transformCount = selectedFindings.filter(
    (finding) => finding.entity_type === "transform",
  ).length;
  const archivableCount = count - transformCount;

  const handleConfirm = async () => {
    const { failed } = await trashFindings(selectedFindings);
    if (failed > 0) {
      dispatch(
        addUndo({
          icon: "warning",
          message: ngettext(
            msgid`Couldn't move ${failed} item to the trash`,
            `Couldn't move ${failed} items to the trash`,
            failed,
          ),
        }),
      );
    }
    setIsConfirmOpen(false);
    onTrashed();
    onClear();
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
        <BulkActionDangerButton onClick={() => setIsConfirmOpen(true)}>
          {t`Move to trash`}
        </BulkActionDangerButton>
      </BulkActionBar>
      <ConfirmModal
        opened={isConfirmOpen}
        title={t`Move to trash?`}
        message={getConfirmMessage(archivableCount, transformCount)}
        confirmButtonText={t`Move to trash`}
        onConfirm={handleConfirm}
        onClose={() => setIsConfirmOpen(false)}
      />
    </>
  );
}
