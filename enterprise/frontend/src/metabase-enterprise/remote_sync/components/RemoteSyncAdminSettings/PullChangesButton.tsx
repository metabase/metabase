import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { dismissAllUndo } from "metabase/redux/undo";
import { Button, Tooltip } from "metabase/ui";
import { useImportChangesMutation } from "metabase-enterprise/api";
import { getCurrentTask } from "metabase-enterprise/remote_sync/selectors";

import { trackPullChanges } from "../../analytics";

interface PullChangesButtonProps {
  dirty: boolean; // disambiguation: local form state, not the git-synced collection state
  branch: string;
  forcePull: boolean;
}

export const PullChangesButton = (props: PullChangesButtonProps) => {
  const { branch, forcePull, dirty } = props;
  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const dispatch = useDispatch();
  const currentTask = useSelector(getCurrentTask);
  const [sendToast] = useToast();

  const handlePullChanges = useCallback(async () => {
    try {
      await importChanges({ branch, force: forcePull }).unwrap();

      trackPullChanges({
        triggeredFrom: "admin-settings",
        force: forcePull,
      });

      sendToast({
        message: t`Pulling latest changes...`,
        icon: "info",
      });
    } catch (error) {
      sendToast({
        message: t`Failed to pull changes`,
        icon: "warning",
      });
    }
  }, [importChanges, branch, forcePull, sendToast]);

  useEffect(() => {
    if (
      currentTask?.sync_task_type === "import" &&
      ["conflict", "successful"].includes(currentTask?.status)
    ) {
      dispatch(dismissAllUndo());
    }
  }, [currentTask, dispatch]);

  return (
    <Tooltip label={t`Save settings before pulling changes`} disabled={!dirty}>
      <Button
        disabled={isImporting || dirty}
        loading={isImporting}
        onClick={handlePullChanges}
        variant="outline"
      >
        {t`Pull changes now`}
      </Button>
    </Tooltip>
  );
};
