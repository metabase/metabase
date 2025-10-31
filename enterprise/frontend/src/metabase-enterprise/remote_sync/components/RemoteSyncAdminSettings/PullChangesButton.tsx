import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { Button, Tooltip } from "metabase/ui";
import { useImportChangesMutation } from "metabase-enterprise/api";

interface PullChangesButtonProps {
  dirty: boolean; // disambiguation: local form state, not the git-synced collection state
  branch: string;
  forcePull: boolean;
}

export const PullChangesButton = (props: PullChangesButtonProps) => {
  const { branch, forcePull, dirty } = props;
  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [sendToast] = useToast();

  const handlePullChanges = useCallback(async () => {
    try {
      await importChanges({ branch, force: forcePull }).unwrap();
      sendToast({
        message: t`Latest changes have been pulled successfully`,
        icon: "check",
      });
    } catch (error) {
      sendToast({
        message: t`Failed to pull changes`,
        icon: "warning",
      });
    }
  }, [importChanges, branch, forcePull, sendToast]);

  return (
    <Tooltip label={t`Save settings before pulling changes`} disabled={!dirty}>
      <Button
        disabled={isImporting || dirty}
        loading={isImporting}
        maw="7rem"
        onClick={handlePullChanges}
        variant="outline"
      >
        {t`Pull changes`}
      </Button>
    </Tooltip>
  );
};
