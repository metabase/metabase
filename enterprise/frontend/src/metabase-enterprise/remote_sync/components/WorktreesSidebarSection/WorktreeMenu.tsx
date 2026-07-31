import { t } from "ttag";

import { ActionIcon, Icon, Loader, Menu, Tooltip } from "metabase/ui";

interface WorktreeMenuProps {
  isReadOnly: boolean;
  isDirty: boolean;
  isPullDisabled: boolean;
  isFetchingRemoteChanges: boolean;
  isCheckingPreflight: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPull: () => void;
  onPush: () => void;
  onNewCollection: () => void;
  onDelete: () => void;
}

/** The actions menu on a worktree's sidebar row: new collection, pull, push, delete. */
export const WorktreeMenu = ({
  isReadOnly,
  isDirty,
  isPullDisabled,
  isFetchingRemoteChanges,
  isCheckingPreflight,
  isOpen,
  onOpenChange,
  onPull,
  onPush,
  onNewCollection,
  onDelete,
}: WorktreeMenuProps) => (
  <Menu position="bottom-end" opened={isOpen} onChange={onOpenChange}>
    <Menu.Target>
      <ActionIcon
        aria-label={t`Worktree actions`}
        color="text-secondary"
        size="sm"
        loading={isCheckingPreflight}
      >
        <Icon name="ellipsis" />
      </ActionIcon>
    </Menu.Target>
    <Menu.Dropdown>
      {!isReadOnly && (
        <Menu.Item leftSection={<Icon name="add" />} onClick={onNewCollection}>
          {t`New collection`}
        </Menu.Item>
      )}
      <Tooltip
        label={
          isPullDisabled && !isFetchingRemoteChanges
            ? t`No changes to pull`
            : t`Pull from remote`
        }
      >
        <Menu.Item
          leftSection={
            isFetchingRemoteChanges ? (
              <Loader size={12} data-testid="pull-changes-loader" />
            ) : (
              <Icon name="download" />
            )
          }
          disabled={isPullDisabled}
          onClick={onPull}
        >
          {t`Pull changes`}
        </Menu.Item>
      </Tooltip>
      {!isReadOnly && (
        <Tooltip label={isDirty ? t`Push changes` : t`No changes to push`}>
          <Menu.Item
            leftSection={<Icon name="upload" />}
            disabled={!isDirty}
            onClick={onPush}
          >
            {t`Push changes`}
          </Menu.Item>
        </Tooltip>
      )}
      <Menu.Divider />
      <Menu.Item
        c="danger"
        leftSection={<Icon name="trash" />}
        onClick={onDelete}
      >
        {t`Delete worktree`}
      </Menu.Item>
    </Menu.Dropdown>
  </Menu>
);
