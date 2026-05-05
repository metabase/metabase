import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, FixedSizeIcon, Menu, Tooltip } from "metabase/ui";
import { dataStudioArchivedSnippets } from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { SnippetCollectionPermissionsModal } from "metabase-enterprise/snippets/components/SnippetCollectionPermissionsModal";
import type { CollectionId } from "metabase-types/api";

type RootSnippetsCollectionMenu = {
  collectionId: CollectionId;
};

export const RootSnippetsCollectionMenu = ({
  collectionId,
}: RootSnippetsCollectionMenu) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const isReadOnly = remoteSyncReadOnly || !isAdmin;
  const [showPermissionsModal, { toggle: togglePermissionsModal }] =
    useDisclosure(false);

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
        {!isReadOnly && (
          <Menu.Item
            leftSection={<FixedSizeIcon name="lock" />}
            onClick={(e) => {
              e.stopPropagation();
              togglePermissionsModal();
            }}
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
      {showPermissionsModal && (
        <SnippetCollectionPermissionsModal
          collectionId={collectionId}
          onClose={togglePermissionsModal}
        />
      )}
    </Menu>
  );
};
