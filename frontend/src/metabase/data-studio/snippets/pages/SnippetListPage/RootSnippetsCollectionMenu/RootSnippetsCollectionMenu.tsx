import { t } from "ttag";

import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import { Link } from "metabase/common/components/Link";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_REMOTE_SYNC, PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import { dataStudioArchivedSnippets } from "metabase/urls";
import type { Collection } from "metabase-types/api";

type RootSnippetsCollectionMenuProps = {
  collection: Collection;
  onOpenModal: (modal: CollectionRowModalState) => void;
};

export const RootSnippetsCollectionMenu = ({
  collection,
  onOpenModal,
}: RootSnippetsCollectionMenuProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const canChangePermissions =
    PLUGIN_SNIPPET_FOLDERS.isEnabled && isAdmin && !remoteSyncReadOnly;

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
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
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
          to={dataStudioArchivedSnippets()}
        >
          {t`View archived snippets`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
