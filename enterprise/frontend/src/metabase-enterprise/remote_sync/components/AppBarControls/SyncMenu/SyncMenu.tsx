import { t } from "ttag";

import { Button, Icon, Loader, Menu } from "metabase/ui";
import {
  useGetHasRemoteChangesQuery,
  useGetRemoteSyncIsDirtyQuery,
} from "metabase-enterprise/api";

type SyncMenuProps = {
  onPull: () => void;
  onPush: () => void;
  onPushToNewBranch: () => void;
};

export const SyncMenu = ({
  onPull,
  onPush,
  onPushToNewBranch,
}: SyncMenuProps) => (
  <Menu position="bottom-end">
    <Menu.Target>
      <Button leftSection={<Icon name="sync" />}>{t`Sync`}</Button>
    </Menu.Target>
    <Menu.Dropdown>
      <PullMenuItem onClick={onPull} />
      <PushMenuItem onClick={onPush} />
      <Menu.Item leftSection={<Icon name="add" />} onClick={onPushToNewBranch}>
        {t`Push to a new branch`}
      </Menu.Item>
    </Menu.Dropdown>
  </Menu>
);

type SyncMenuItemProps = {
  onClick: () => void;
};

const PullMenuItem = ({ onClick }: SyncMenuItemProps) => {
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
};

const PushMenuItem = ({ onClick }: SyncMenuItemProps) => {
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
};
