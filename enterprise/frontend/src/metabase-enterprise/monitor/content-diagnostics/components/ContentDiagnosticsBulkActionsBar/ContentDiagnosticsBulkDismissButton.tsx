import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { BulkActionButton } from "metabase/common/components/BulkActionBar";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type { InvalidateFindingsResponse } from "metabase-types/api";

import type { BulkDismissAction } from "./use-bulk-dismiss-findings";

interface ContentDiagnosticsBulkDismissButtonProps extends BulkDismissAction {
  findingIds: number[];
  onDismiss: (findingIds: number[]) => void;
}

function getDismissLabel(count: number) {
  return ngettext(msgid`Dismiss finding`, `Dismiss findings`, count);
}

export function ContentDiagnosticsBulkDismissButton({
  findingIds,
  onDismiss,
  dismissFindings,
  isDismissing,
}: ContentDiagnosticsBulkDismissButtonProps) {
  const dispatch = useDispatch();
  const [isOpen, { open, close }] = useDisclosure();
  const [confirmationCount, setConfirmationCount] = useState(0);

  const handleClose = () => {
    setConfirmationCount(findingIds.length);
    close();
  };

  const handleConfirm = async () => {
    if (isDismissing) {
      return;
    }
    if (findingIds.length === 0) {
      handleClose();
      return;
    }

    handleClose();
    let result: InvalidateFindingsResponse;
    try {
      result = await dismissFindings(findingIds);
    } catch (error) {
      dispatch(
        addUndo({
          icon: "warning",
          message: getErrorMessage(error, t`Couldn't dismiss findings`),
        }),
      );
      return;
    }

    const count = result.invalidated.length;
    dispatch(
      addUndo({
        message:
          count === 0
            ? t`No findings were dismissed`
            : ngettext(
                msgid`Dismissed ${count} finding`,
                `Dismissed ${count} findings`,
                count,
              ),
      }),
    );
    onDismiss(findingIds);
  };

  const count = isOpen ? findingIds.length : confirmationCount;

  return (
    <>
      <BulkActionButton disabled={isDismissing} onClick={open}>
        {getDismissLabel(findingIds.length)}
      </BulkActionButton>
      <ConfirmModal
        opened={isOpen}
        title={ngettext(
          msgid`Dismiss ${count} finding?`,
          `Dismiss ${count} findings?`,
          count,
        )}
        message={t`Dismissed findings will be hidden for everyone. The underlying content will not be deleted.`}
        confirmButtonText={getDismissLabel(count)}
        confirmButtonProps={{ color: "brand", disabled: isDismissing }}
        onConfirm={handleConfirm}
        onClose={() => {
          if (!isDismissing) {
            handleClose();
          }
        }}
      />
    </>
  );
}
