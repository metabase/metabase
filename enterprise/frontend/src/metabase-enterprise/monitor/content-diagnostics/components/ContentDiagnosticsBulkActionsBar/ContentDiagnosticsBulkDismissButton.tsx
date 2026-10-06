import { useDisclosure } from "@mantine/hooks";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { BulkActionButton } from "metabase/common/components/BulkActionBar";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useInvalidateFindingsMutation } from "metabase-enterprise/api";

interface ContentDiagnosticsBulkDismissButtonProps {
  findingIds: number[];
  onDismiss: (findingIds: number[]) => void;
}

export function ContentDiagnosticsBulkDismissButton({
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

    close();
    const result = await invalidateFindings({ ids: findingIds });
    if ("error" in result) {
      dispatch(
        addUndo({
          icon: "warning",
          message: getErrorMessage(result.error, t`Couldn't dismiss findings`),
        }),
      );
      return;
    }

    const count = result.data.invalidated.length;
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

  return (
    <>
      <BulkActionButton disabled={isLoading} onClick={open}>
        {t`Dismiss`}
      </BulkActionButton>
      <ConfirmModal
        opened={isOpen}
        title={ngettext(
          msgid`Dismiss ${findingIds.length} finding?`,
          `Dismiss ${findingIds.length} findings?`,
          findingIds.length,
        )}
        message={t`Dismissed findings will be hidden for everyone. The underlying content will not be deleted.`}
        confirmButtonText={t`Dismiss`}
        confirmButtonProps={{ color: "brand", disabled: isLoading }}
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
