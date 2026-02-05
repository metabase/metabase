import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { CollectionId } from "metabase-types/api";

export const RootSnippetsCollectionMenu = ({
  setPermissionsCollectionId,
}: {
  setPermissionsCollectionId: (id: CollectionId) => void;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  if (!isAdmin || remoteSyncReadOnly) {
    return null;
  }

  const optionsLabel = t`Snippet collection options`;

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Tooltip
          label={optionsLabel}
          onClick={(e) => e.stopPropagation()}
          openDelay={1000}
        >
          <ActionIcon aria-label={optionsLabel} size="md">
            <FixedSizeIcon name="ellipsis" size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FixedSizeIcon name="lock" />}
          onClick={(e) => {
            e.stopPropagation();
            setPermissionsCollectionId("root");
          }}
        >
          {t`Change permissions`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
