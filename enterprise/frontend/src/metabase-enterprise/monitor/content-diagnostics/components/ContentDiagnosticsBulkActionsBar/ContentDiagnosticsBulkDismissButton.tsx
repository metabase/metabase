import { useDisclosure } from "@mantine/hooks";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { BulkActionButton } from "metabase/common/components/BulkActionBar";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useInvalidateFindingsMutation } from "metabase-enterprise/api";
import type {
  ContentDiagnosticsFindingId,
  InvalidateFindingsResponse,
} from "metabase-types/api";

import { trackContentDiagnosticsFindingsBulkDismissed } from "../../analytics";
import type { ContentDiagnosticsTab } from "../types";

interface ContentDiagnosticsBulkDismissButtonProps {
  tab: ContentDiagnosticsTab;
  findingIds: readonly ContentDiagnosticsFindingId[];
  onDismiss: (findingIds: ContentDiagnosticsFindingId[]) => void;
}

function getDismissLabel(count: number) {
  return ngettext(msgid`Dismiss finding`, `Dismiss findings`, count);
}

export function ContentDiagnosticsBulkDismissButton({
  tab,
  findingIds,
  onDismiss,
}: ContentDiagnosticsBulkDismissButtonProps) {
  const dispatch = useDispatch();
  const [isOpen, { open, close }] = useDisclosure();
  const [invalidateFindings, { isLoading }] = useInvalidateFindingsMutation();

  const handleConfirm = async () => {
    if (isLoading) {
      return;
    }
    if (findingIds.length === 0) {
      close();
      return;
    }

    const startTime = performance.now();
    let result: InvalidateFindingsResponse;
    try {
      result = await invalidateFindings({ ids: findingIds }).unwrap();
    } catch (error) {
      trackContentDiagnosticsFindingsBulkDismissed({
        tab,
        dismissedCount: 0,
        selectedCount: findingIds.length,
        durationMs: Math.trunc(performance.now() - startTime),
        result: "failure",
      });
      dispatch(
        addUndo({
          icon: "warning",
          message: getErrorMessage(error, t`Couldn't dismiss findings`),
        }),
      );
      close();
      return;
    }

    const count = result.invalidated.length;
    trackContentDiagnosticsFindingsBulkDismissed({
      tab,
      dismissedCount: count,
      selectedCount: findingIds.length,
      durationMs: Math.trunc(performance.now() - startTime),
      result: result.skipped.length > 0 ? "partial" : "success",
    });
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
    close();
    // Skipped IDs are no longer active or visible, rather than failed writes.
    onDismiss([...result.invalidated, ...result.skipped]);
  };

  return (
    <>
      <BulkActionButton disabled={isLoading} onClick={open}>
        {getDismissLabel(findingIds.length)}
      </BulkActionButton>
      <ConfirmModal
        opened={isOpen}
        title={ngettext(
          msgid`Dismiss ${findingIds.length} finding?`,
          `Dismiss ${findingIds.length} findings?`,
          findingIds.length,
        )}
        message={t`Dismissed findings will be hidden for everyone. The underlying content will not be deleted.`}
        confirmButtonText={getDismissLabel(findingIds.length)}
        confirmButtonProps={{
          color: "brand",
          loading: isLoading,
          disabled: isLoading,
        }}
        closeButtonProps={{ disabled: isLoading }}
        onConfirm={handleConfirm}
        onClose={() => {
          if (!isLoading) {
            close();
          }
        }}
      />
    </>
  );
}
