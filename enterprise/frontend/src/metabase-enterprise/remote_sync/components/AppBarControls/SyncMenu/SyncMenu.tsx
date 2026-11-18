import { t } from "ttag";

import { Button, Icon, Loader, Menu, Text } from "metabase/ui";
import {
  useGetHasRemoteChangesQuery,
  useGetRemoteSyncIsDirtyQuery,
} from "metabase-enterprise/api";

type SyncMenuProps = {
  branch: string;
  onPull: () => void;
  onPush: () => void;
};

export function SyncMenu({ branch, onPull, onPush }: SyncMenuProps) {
  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button
          variant="subtle"
          color="neutral"
          leftSection={<Icon name="git_branch" c="text-secondary" size={14} />}
          rightSection={<Icon name="chevrondown" c="text-secondary" size={8} />}
          data-testid="git-sync-controls"
        >
          <Text fw="bold" c="text-secondary" size="sm" lh="md" truncate>
            {branch}
          </Text>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <PushMenuItem onClick={onPush} />
        <PullMenuItem onClick={onPull} />
      </Menu.Dropdown>
    </Menu>
  );
}

type SyncMenuItemProps = {
  onClick: () => void;
};

function PushMenuItem({ onClick }: SyncMenuItemProps) {
  const { data, isFetching } = useGetRemoteSyncIsDirtyQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  return (
    <Menu.Item
      leftSection={<Icon name="arrow_up" />}
      rightSection={isFetching ? <Loader size="xs" /> : undefined}
      disabled={isFetching || !data?.is_dirty}
      onClick={onClick}
    >
      {t`Push changes`}
    </Menu.Item>
  );
}

function PullMenuItem({ onClick }: SyncMenuItemProps) {
  const { data, isFetching } = useGetHasRemoteChangesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  return (
    <Menu.Item
      leftSection={<Icon name="arrow_down" />}
      rightSection={isFetching ? <Loader size="xs" /> : undefined}
      disabled={isFetching || !data?.has_changes}
      onClick={onClick}
    >
      {t`Pull changes`}
    </Menu.Item>
  );
}
