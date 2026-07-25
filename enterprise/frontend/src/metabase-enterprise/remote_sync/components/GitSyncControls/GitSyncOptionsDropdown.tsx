import { t } from "ttag";

import { Box, Combobox, Group, Icon, Loader, Text, Tooltip } from "metabase/ui";

export interface GitSyncOptionsDropdownProps {
  isPullDisabled: boolean;
  isPullError: boolean;
  /**
   * Hides the "Pull changes" option entirely. A workspace's pull isn't wired into this UI (it's
   * a separate, workspace-scoped operation with no conflict-resolution flow here yet), so with an
   * active workspace this control only offers Push.
   */
  isPullHidden?: boolean;
  isLoadingPull: boolean;
  isPushDisabled: boolean;
  onPullClick: VoidFunction;
  onPushClick: VoidFunction;
}

export const GitSyncOptionsDropdown = ({
  isPullDisabled,
  isPullError,
  isPullHidden,
  isLoadingPull,
  isPushDisabled,
  onPullClick,
  onPushClick,
}: GitSyncOptionsDropdownProps) => {
  // The pull-changes check failing shouldn't hide Push too when pull isn't even offered.
  if (isPullError && !isPullHidden) {
    return (
      <Combobox.Dropdown p={0}>
        <Box p="md">
          <Text size="sm" c="feedback-negative" ta="center">
            {t`Failed to check for changes — check your authentication token`}
          </Text>
        </Box>
      </Combobox.Dropdown>
    );
  }

  return (
    <Combobox.Dropdown p={0}>
      <Combobox.Options>
        <Tooltip
          label={isPushDisabled ? t`No changes to push` : t`Push changes`}
        >
          <Combobox.Option
            disabled={isPushDisabled}
            onClick={onPushClick}
            py="sm"
            value="push"
          >
            <Group gap="md" wrap="nowrap">
              <Icon name="arrow_up" size={12} />
              <Text>{t`Push changes`}</Text>
            </Group>
          </Combobox.Option>
        </Tooltip>

        {!isPullHidden && (
          <Tooltip
            label={isPullDisabled ? t`No changes to pull` : t`Pull from remote`}
          >
            <Combobox.Option
              disabled={isPullDisabled || isLoadingPull}
              onClick={onPullClick}
              py="sm"
              value="pull"
            >
              <Group gap="md" wrap="nowrap">
                {isLoadingPull ? (
                  <Loader size={12} data-testid="pull-changes-loader" />
                ) : (
                  <Icon name="arrow_down" size={12} />
                )}
                <Text>{t`Pull changes`}</Text>
              </Group>
            </Combobox.Option>
          </Tooltip>
        )}
      </Combobox.Options>
    </Combobox.Dropdown>
  );
};
