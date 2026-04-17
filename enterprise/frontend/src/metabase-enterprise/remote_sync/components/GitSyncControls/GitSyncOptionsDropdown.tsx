import { t } from "ttag";

import {
  Badge,
  Box,
  Combobox,
  Group,
  Icon,
  Loader,
  Text,
  Tooltip,
} from "metabase/ui";

export interface GitSyncOptionsDropdownProps {
  isPullDisabled: boolean;
  isPullError: boolean;
  isLoadingPull: boolean;
  isPushDisabled: boolean;
  isSwitchBranchDisabled?: boolean;
  onPullClick: VoidFunction;
  onPushClick: VoidFunction;
  onSwitchBranchClick: VoidFunction;
}

export const GitSyncOptionsDropdown = ({
  isPullDisabled,
  isPullError,
  isLoadingPull,
  isPushDisabled,
  isSwitchBranchDisabled,
  onPullClick,
  onPushClick,
  onSwitchBranchClick,
}: GitSyncOptionsDropdownProps) => {
  if (isPullError) {
    return (
      <Combobox.Dropdown p={0}>
        <Box p="md">
          <Text size="sm" c="error" ta="center">
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

        {isSwitchBranchDisabled ? (
          <Badge
            color="text-primary"
            bg="background-secondary"
            size="md"
            fz="12px"
            py="md"
            style={{ textTransform: "none" }}
            bdrs="sm"
          >{t`Branch set by an environment variable`}</Badge>
        ) : (
          <Combobox.Option
            onClick={onSwitchBranchClick}
            py="sm"
            value="switch-branch"
          >
            <Group gap="md" wrap="nowrap">
              <Icon name="git_branch" size={12} />
              <Text>{t`Switch branch`}</Text>
            </Group>
          </Combobox.Option>
        )}
      </Combobox.Options>
    </Combobox.Dropdown>
  );
};
