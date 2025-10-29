import type { Dispatch, SetStateAction } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { ActionIcon, Icon } from "metabase/ui";
import { useImportChangesMutation } from "metabase-enterprise/api";
import {
  type SyncError,
  parseSyncError,
} from "metabase-enterprise/remote_sync/utils";

import type { SyncConflictVariant } from "../SyncConflictModal";

interface PushChangesButtonProps {
  branch: string;
  setSyncConflictVariant: Dispatch<
    SetStateAction<SyncConflictVariant | undefined>
  >;
}

export const PullFromRemoteButton = (props: PushChangesButtonProps) => {
  const { branch, setSyncConflictVariant } = props;
  const [importChanges, { isLoading }] = useImportChangesMutation();
  const [sendToast] = useToast();

  const handleClick = async () => {
    try {
      await importChanges({ branch }).unwrap();
      sendToast({
        message: t`Your branch is now up to date with remote`,
        icon: "check",
      });
    } catch (error) {
      const { hasConflict, errorMessage } = parseSyncError(error as SyncError);

      if (hasConflict) {
        setSyncConflictVariant("pull");
        return;
      }

      sendToast({
        message: errorMessage || t`Failed to pull from remote`,
        icon: "warning",
      });
    }
  };

  return (
    <ActionIcon
      aria-label={t`Pull from Git`}
      c="icon-secondary"
      disabled={isLoading}
      h={24}
      onClick={handleClick}
      px={0}
      variant="subtle"
    >
      <Icon name="arrow_down" size={16} tooltip={t`Pull from Git`} />
    </ActionIcon>
  );
};
