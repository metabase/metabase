import { t } from "ttag";

import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import { Link } from "metabase/common/components/Link";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_LIBRARY, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

type RootDataActionsMenuProps = {
  collection: Collection;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

export function RootDataActionsMenu({
  collection,
  onOpenModal,
}: RootDataActionsMenuProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const canChangePermissions =
    PLUGIN_LIBRARY.isEnabled && isAdmin && !remoteSyncReadOnly;
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
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        {canChangePermissions && (
          <Menu.Item
            leftSection={<FixedSizeIcon name="lock" />}
            onClick={() => onOpenModal({ type: "permissions", collection })}
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
    </Menu>
  );
}
