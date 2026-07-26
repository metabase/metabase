import { t } from "ttag";

import { Box, Icon, Loader, Menu, Text, Tooltip } from "metabase/ui";

export interface GitSyncOptionsDropdownProps {
  isPullDisabled: boolean;
  isPullError: boolean;
  isLoadingPull: boolean;
  isPushDisabled: boolean;
  onPullClick: VoidFunction;
  onPushClick: VoidFunction;
}

export const GitSyncOptionsDropdown = ({
  isPullDisabled,
  isPullError,
  isLoadingPull,
  isPushDisabled,
  onPullClick,
  onPushClick,
}: GitSyncOptionsDropdownProps) => {
  if (isPullError) {
    return (
      <Box p="md">
        <Text size="sm" c="feedback-negative" ta="center">
          {t`Failed to check for changes — check your authentication token`}
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Tooltip label={isPushDisabled ? t`No changes to push` : t`Push changes`}>
        <Menu.Item
          disabled={isPushDisabled}
          onClick={onPushClick}
          closeMenuOnClick={false}
          leftSection={<Icon name="arrow_up" size={12} />}
        >
          {t`Push changes`}
        </Menu.Item>
      </Tooltip>

      <Tooltip
        label={isPullDisabled ? t`No changes to pull` : t`Pull from remote`}
      >
        <Menu.Item
          disabled={isPullDisabled || isLoadingPull}
          onClick={onPullClick}
          closeMenuOnClick={false}
          leftSection={
            isLoadingPull ? (
              <Loader size={12} data-testid="pull-changes-loader" />
            ) : (
              <Icon name="arrow_down" size={12} />
            )
          }
        >
          {t`Pull changes`}
        </Menu.Item>
      </Tooltip>
    </>
  );
};
