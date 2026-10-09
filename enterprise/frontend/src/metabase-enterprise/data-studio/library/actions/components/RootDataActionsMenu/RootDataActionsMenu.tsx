import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";

export function RootDataActionsMenu() {
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const canChangePermissions = isAdmin && !remoteSyncReadOnly;
  const [isPermissionsModalOpen, { toggle: togglePermissionsModal }] =
    useDisclosure(false);
  const optionsLabel = t`Data action options`;

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Tooltip
          label={optionsLabel}
          onClick={(event) => event.stopPropagation()}
          openDelay={1000}
        >
          <ActionIcon aria-label={optionsLabel} size="md">
            <FixedSizeIcon name="ellipsis" size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {canChangePermissions && (
          <Menu.Item
            leftSection={<FixedSizeIcon name="lock" />}
            onClick={(event) => {
              event.stopPropagation();
              togglePermissionsModal();
            }}
          >
            {t`Change permissions`}
          </Menu.Item>
        )}
        <Menu.Item
          component={Link}
          leftSection={<FixedSizeIcon name="view_archive" />}
          to={Urls.dataStudioArchivedActions()}
        >
          {t`View archived actions`}
        </Menu.Item>
      </Menu.Dropdown>
      <PLUGIN_LIBRARY.CollectionPermissionsModal
        opened={isPermissionsModalOpen}
        collectionId="root"
        namespace="data-actions"
        onClose={togglePermissionsModal}
      />
    </Menu>
  );
}
