import { t } from "ttag";

import {
  Box,
  Combobox,
  Divider,
  Group,
  Icon,
  Loader,
  Text,
  Tooltip,
} from "metabase/ui";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

export interface GitSyncOptionsDropdownProps {
  worktreeId?: RemoteSyncWorktreeId;
  isPullDisabled: boolean;
  isPullError: boolean;
  isLoadingPull: boolean;
  isPushDisabled: boolean;
  onPullClick: VoidFunction;
  onPushClick: VoidFunction;
  onDeleteClick?: VoidFunction;
}

export const GitSyncOptionsDropdown = ({
  worktreeId,
  isPullDisabled,
  isPullError,
  isLoadingPull,
  isPushDisabled,
  onPullClick,
  onPushClick,
  onDeleteClick,
}: GitSyncOptionsDropdownProps) => {
  if (isPullError) {
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

        {worktreeId !== undefined && (
          <>
            <Divider />
            <Combobox.Option onClick={onDeleteClick} py="sm" value="delete">
              <Group gap="md" wrap="nowrap">
                <Icon name="trash" size={12} c="danger" />
                <Text c="danger">{t`Delete worktree`}</Text>
              </Group>
            </Combobox.Option>
          </>
        )}
      </Combobox.Options>
    </Combobox.Dropdown>
  );
};
