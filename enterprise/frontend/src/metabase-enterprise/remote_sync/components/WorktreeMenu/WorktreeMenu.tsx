import { useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useGetHasRemoteChangesQuery } from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

import { type GitSyncAction, GitSyncActionModal } from "../GitSyncActionModal";

type WorktreeMenuProps = {
  worktree: Worktree;
  hasChanges: boolean;
};

export function WorktreeMenu({ worktree, hasChanges }: WorktreeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState<GitSyncAction>();

  const { currentData: remoteChanges, isFetching: isCheckingRemote } =
    useGetHasRemoteChangesQuery(
      { "worktree-id": worktree.id },
      { refetchOnMountOrArgChange: 10, skip: !isOpen },
    );

  const handleActionClick = (action: GitSyncAction) => {
    setIsOpen(false);
    setAction(action);
  };

  return (
    <>
      <Menu opened={isOpen} onChange={setIsOpen} position="bottom-end">
        <Menu.Target>
          <ActionIcon
            aria-label={t`Branch options`}
            c="text-secondary"
            size="sm"
          >
            <Icon name="ellipsis" size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={!hasChanges}
            leftSection={<Icon name="arrow_up" size={12} />}
            onClick={() => handleActionClick("push")}
          >
            {t`Push changes`}
          </Menu.Item>
          <Menu.Item
            disabled={!remoteChanges?.has_changes || isCheckingRemote}
            leftSection={<Icon name="arrow_down" size={12} />}
            onClick={() => handleActionClick("pull")}
          >
            {t`Pull changes`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {action != null && (
        <GitSyncActionModal
          opened
          action={action}
          branch={worktree.branch}
          isDirty={hasChanges}
          worktreeId={worktree.id}
          onClose={() => setAction(undefined)}
        />
      )}
    </>
  );
}
