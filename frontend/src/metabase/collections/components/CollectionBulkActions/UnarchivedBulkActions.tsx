import { t } from "ttag";

import { BulkActionButton } from "metabase/common/components/BulkActionBar";

type UnarchivedBulkActionsProps = {
  onRequestMove?: () => void;
  onRequestTrash?: () => void;
};

export const UnarchivedBulkActions = ({
  onRequestMove,
  onRequestTrash,
}: UnarchivedBulkActionsProps) => {
  return (
    <>
      <BulkActionButton
        disabled={onRequestMove == null}
        onClick={onRequestMove}
      >{t`Move`}</BulkActionButton>
      <BulkActionButton
        disabled={onRequestTrash == null}
        onClick={onRequestTrash}
      >{t`Move to trash`}</BulkActionButton>
    </>
  );
};
