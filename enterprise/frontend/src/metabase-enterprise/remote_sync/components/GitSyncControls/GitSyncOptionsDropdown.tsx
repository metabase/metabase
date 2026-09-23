import { t } from "ttag";

import { Box, Divider, Icon, Loader, Menu, Text, Tooltip } from "metabase/ui";

export interface GitSyncOptionsDropdownProps {
  isPullDisabled: boolean;
  isPullError: boolean;
  isLoadingPull: boolean;
  isPushDisabled: boolean;
  hasSyncActions: boolean;
  isInWorktree: boolean;
  onPullClick: VoidFunction;
  onPushClick: VoidFunction;
  onEnterWorktreeClick: VoidFunction;
  onLeaveWorktreeClick: VoidFunction;
}

export const GitSyncOptionsDropdown = ({
  isPullDisabled,
  isPullError,
  isLoadingPull,
  isPushDisabled,
  hasSyncActions,
  isInWorktree,
  onPullClick,
  onPushClick,
  onEnterWorktreeClick,
  onLeaveWorktreeClick,
}: GitSyncOptionsDropdownProps) => {
  if (isPullError) {
    return (
      <Menu.Dropdown>
        <Box p="lg">
          <Text size="sm" c="feedback-negative" ta="center">
            {t`Failed to check for changes — check your authentication token`}
          </Text>
        </Box>
      </Menu.Dropdown>
    );
  }

  return (
    <Menu.Dropdown>
      {hasSyncActions && (
        <>
          <Tooltip
            label={isPushDisabled ? t`No changes to push` : t`Push changes`}
          >
            <Menu.Item
              disabled={isPushDisabled}
              leftSection={<Icon name="arrow_up" size={12} />}
              onClick={onPushClick}
            >
              {t`Push changes`}
            </Menu.Item>
          </Tooltip>

          <Tooltip
            label={isPullDisabled ? t`No changes to pull` : t`Pull from remote`}
          >
            <Menu.Item
              disabled={isPullDisabled || isLoadingPull}
              leftSection={
                isLoadingPull ? (
                  <Loader size={12} data-testid="pull-changes-loader" />
                ) : (
                  <Icon name="arrow_down" size={12} />
                )
              }
              onClick={onPullClick}
            >
              {t`Pull changes`}
            </Menu.Item>
          </Tooltip>

          <Divider my="xs" />
        </>
      )}

      <Menu.Label>{t`Worktrees`}</Menu.Label>
      <Menu.Item
        leftSection={<Icon name="git_branch" size={12} />}
        onClick={onEnterWorktreeClick}
      >
        {t`Enter worktree`}
      </Menu.Item>
      <Menu.Item
        disabled={!isInWorktree}
        leftSection={<Icon name="close" size={12} />}
        onClick={onLeaveWorktreeClick}
      >
        {t`Leave worktree`}
      </Menu.Item>
    </Menu.Dropdown>
  );
};
