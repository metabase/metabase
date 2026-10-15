import { match } from "ts-pattern";
import { t } from "ttag";

import { isRootCollection } from "metabase/common/collections/utils";
import { getUserIsAdmin } from "metabase/current-user";
import {
  PLUGIN_LIBRARY,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_SNIPPET_FOLDERS,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Icon,
  Menu,
  Tooltip,
} from "metabase/ui";
import type { Collection } from "metabase-types/api";

import type { CollectionRowModalState } from "../CollectionRowModal";
import { UnarchiveCollectionButton } from "../UnarchiveCollectionButton";

type CollectionRowMenuProps = {
  collection: Collection;
  onOpenModal: (modal: CollectionRowModalState) => void;
  customArchiveMessage?: string;
};

export function CollectionRowMenu({
  collection,
  onOpenModal,
  customArchiveMessage,
}: CollectionRowMenuProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const showPermissionsOption =
    isAdmin &&
    (PLUGIN_LIBRARY.isEnabled || PLUGIN_SNIPPET_FOLDERS.isEnabled) &&
    collection.namespace !== "transforms";

  const isRoot = isRootCollection(collection);

  if (!collection.can_write || remoteSyncReadOnly) {
    return null;
  }

  if (collection.archived) {
    return <UnarchiveCollectionButton collection={collection} />;
  }

  const optionsLabel = match(collection.namespace)
    .with("snippets", () => t`Snippet folder options`)
    .with("data-actions", () => t`Folder options`)
    .otherwise(() => t`Collection options`);
  const isFolder =
    collection.namespace === "snippets" ||
    collection.namespace === "data-actions";

  return (
    <Box onClick={(e) => e.stopPropagation()}>
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
          {!isRoot && (
            <Menu.Item
              leftSection={<Icon name="pencil" />}
              onClick={() => onOpenModal({ type: "edit", collection })}
            >
              {isFolder ? t`Edit folder details` : t`Edit collection details`}
            </Menu.Item>
          )}
          {showPermissionsOption && (
            <Menu.Item
              leftSection={<Icon name="lock" />}
              onClick={() => onOpenModal({ type: "permissions", collection })}
            >
              {t`Change permissions`}
            </Menu.Item>
          )}
          {!isRoot && (
            <Menu.Item
              leftSection={<Icon name="archive" />}
              onClick={() =>
                onOpenModal({
                  type: "archive",
                  collection,
                  customArchiveMessage,
                })
              }
              c="feedback-negative"
            >
              {t`Archive`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
