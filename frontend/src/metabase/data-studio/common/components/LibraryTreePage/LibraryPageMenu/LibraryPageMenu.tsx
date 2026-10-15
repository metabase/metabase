import { t } from "ttag";

import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import type { Collection, IconName } from "metabase-types/api";

export type LibraryPageAction = {
  label: string;
  icon: IconName;
  to: string;
};

export type LibraryPageMenuProps = {
  label: string;
  actions?: LibraryPageAction[];
  /** Admins get a Change permissions item for it, unless remote sync is read-only. */
  permissionsCollection?: Collection;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

export function LibraryPageMenu({
  label,
  actions = [],
  permissionsCollection,
  onOpenModal,
}: LibraryPageMenuProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const editablePermissionsCollection =
    isAdmin && !isRemoteSyncReadOnly ? permissionsCollection : undefined;

  if (editablePermissionsCollection == null && actions.length === 0) {
    return null;
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button
          size="lg"
          aria-label={label}
          leftSection={<Icon name="ellipsis" />}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {editablePermissionsCollection != null && (
          <Menu.Item
            leftSection={<FixedSizeIcon name="lock" />}
            onClick={() =>
              onOpenModal({
                type: "permissions",
                collection: editablePermissionsCollection,
              })
            }
          >
            {t`Change permissions`}
          </Menu.Item>
        )}
        {actions.map((action) => (
          <Menu.Item
            key={action.label}
            component={ForwardRefLink}
            to={action.to}
            leftSection={<FixedSizeIcon name={action.icon} />}
          >
            {action.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
