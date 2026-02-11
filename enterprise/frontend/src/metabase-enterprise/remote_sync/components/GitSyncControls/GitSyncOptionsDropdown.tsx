import { t } from "ttag";

import { Combobox, Group, Icon, Loader, Text, Tooltip } from "metabase/ui";

export interface GitSyncOptionsDropdownProps {
  isPullDisabled: boolean;
  isLoadingPull: boolean;
  isPushDisabled: boolean;
  onPullClick: VoidFunction;
  onPushClick: VoidFunction;
  onSwitchBranchClick: VoidFunction;
}

export const GitSyncOptionsDropdown = ({
  isPullDisabled,
  isLoadingPull,
  isPushDisabled,
  onPullClick,
  onPushClick,
  onSwitchBranchClick,
}: GitSyncOptionsDropdownProps) => {
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
      </Combobox.Options>
    </Combobox.Dropdown>
  );
};
