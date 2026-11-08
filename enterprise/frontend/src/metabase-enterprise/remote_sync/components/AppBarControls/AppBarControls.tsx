import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useSetting } from "metabase/settings";
import { Button, Group, Icon, Menu, Select } from "metabase/ui";
import {
  useGetRemoteSyncBranchesQuery,
  useGetRemoteSyncCurrentTaskQuery,
  useImportChangesMutation,
} from "metabase-enterprise/api";

import { trackBranchSwitched, trackPullChanges } from "../../analytics";
import { useIsRemoteSyncVisible, useRemoteSyncDirtyState } from "../../hooks";
import { CollectionSyncStatusBadge } from "../CollectionSyncStatusBadge";

import { NewBranchModal } from "./NewBranchModal";
import { PullModal } from "./PullModal";
import { PushModal } from "./PushModal";

type ControlsModal =
  | { type: "push" }
  | { type: "pull"; targetBranch: string }
  | { type: "new-branch" };

export const AppBarControls = () => {
  const isVisible = useIsRemoteSyncVisible();
  const branch = useSetting("remote-sync-branch");

  if (!isVisible || !branch) {
    return null;
  }

  return <Controls branch={branch} />;
};

type ControlsProps = {
  branch: string;
};

const Controls = ({ branch }: ControlsProps) => {
  const { data: branchesResponse } = useGetRemoteSyncBranchesQuery();
  const { data: task } = useGetRemoteSyncCurrentTaskQuery();
  const { dirty } = useRemoteSyncDirtyState();
  const [importChanges, { isLoading: isImporting }] =
    useImportChangesMutation();
  const [modal, setModal] = useState<ControlsModal | null>(null);
  const [sendToast] = useToast();

  const isBusy = isImporting || task?.status === "running";
  const hasChanges = dirty.length > 0;
  const branches = _.uniq([branch, ...(branchesResponse?.items ?? [])]);

  const handlePull = async (targetBranch: string) => {
    if (hasChanges) {
      setModal({ type: "pull", targetBranch });
      return;
    }
    try {
      await importChanges({
        branch: targetBranch,
        expected_branch: branch,
      }).unwrap();
      if (targetBranch === branch) {
        trackPullChanges({ triggeredFrom: "app-bar", force: false });
      } else {
        trackBranchSwitched({ triggeredFrom: "app-bar" });
      }
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't pull changes`),
        variant: "negative",
      });
    }
  };

  const handleBranchChange = (value: string | null) => {
    if (value && value !== branch) {
      handlePull(value);
    }
  };

  const handleClose = () => setModal(null);

  return (
    <Group data-testid="git-sync-controls" gap="sm" wrap="nowrap">
      <Select
        aria-label={t`Branch`}
        data={branches}
        value={branch}
        searchable
        leftSection={<Icon name="git_branch" />}
        w="12rem"
        disabled={isBusy}
        onChange={handleBranchChange}
      />
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            leftSection={<Icon name="sync" />}
            rightSection={hasChanges ? <CollectionSyncStatusBadge /> : null}
            loading={isBusy}
          >{t`Sync`}</Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="arrow_down" />}
            onClick={() => handlePull(branch)}
          >{t`Pull changes`}</Menu.Item>
          <Menu.Item
            leftSection={<Icon name="arrow_up" />}
            disabled={!hasChanges}
            onClick={() => setModal({ type: "push" })}
          >{t`Push changes`}</Menu.Item>
          <Menu.Item
            leftSection={<Icon name="add" />}
            onClick={() => setModal({ type: "new-branch" })}
          >{t`Push to a new branch`}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <PushModal
        opened={modal?.type === "push"}
        branch={branch}
        onClose={handleClose}
      />
      <PullModal
        opened={modal?.type === "pull"}
        branch={branch}
        targetBranch={modal?.type === "pull" ? modal.targetBranch : branch}
        onClose={handleClose}
      />
      <NewBranchModal
        opened={modal?.type === "new-branch"}
        onClose={handleClose}
      />
    </Group>
  );
};
