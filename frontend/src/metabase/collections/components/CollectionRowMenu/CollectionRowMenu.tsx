import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  collectionApi,
  snippetApi,
  transformApi,
  useUpdateCollectionMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { isRootCollection } from "metabase/collections/utils";
import { useConfirmation } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_LIBRARY,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_SNIPPET_FOLDERS,
} from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Icon,
  Menu,
  Tooltip,
} from "metabase/ui";
import type { Collection, CollectionId } from "metabase-types/api";

import { EditCollectionModal } from "./EditCollectionModal";

type CollectionRowMenuProps = {
  collection: Collection;
  onSave?: (details: {
    previousParentId: CollectionId | null;
    newParentId: CollectionId | null;
  }) => void;
  onArchiveSuccess?: () => void;
  customArchiveMessage?: string;
};

export function CollectionRowMenu(props: CollectionRowMenuProps) {
  const { collection, onArchiveSuccess, onSave, customArchiveMessage } = props;
  const dispatch = useDispatch();

  const isAdmin = useSelector(getUserIsAdmin);
  const [updateCollection] = useUpdateCollectionMutation();
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const { show, modalContent: confirmationModal } = useConfirmation();
  const [isEditModalOpen, { toggle: toggleEditModal }] = useDisclosure(false);
  const [isPermissionsModalOpen, { toggle: togglePermissionsModal }] =
    useDisclosure(false);
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const showPermissionsOption =
    isAdmin &&
    (PLUGIN_LIBRARY.isEnabled || PLUGIN_SNIPPET_FOLDERS.isEnabled) &&
    collection.namespace !== "transforms";

  const isRoot = isRootCollection(collection);

  if (!collection.can_write || remoteSyncReadOnly) {
    return null;
  }

  const invalidateTags = () => {
    if (collection.namespace === "snippets") {
      dispatch(snippetApi.util.invalidateTags([listTag("snippet")]));
    } else if (collection.namespace === "transforms") {
      dispatch(transformApi.util.invalidateTags([listTag("transform")]));
    } else {
      dispatch(collectionApi.util.invalidateTags([listTag("collection")]));
    }
  };

  const handleArchive = async () => {
    try {
      await updateCollection({ id: collection.id, archived: true }).unwrap();
      sendSuccessToast(t`"${collection.name}" has been archived`);
      invalidateTags();
      onArchiveSuccess?.();
    } catch {
      sendErrorToast(t`"${collection.name}" could not be archived`);
    }
  };

  const onArchiveClick = () => {
    show({
      title: t`Archive "${collection.name}"?`,
      message: customArchiveMessage,
      confirmButtonText: t`Archive`,
      onConfirm: handleArchive,
    });
  };

  if (collection.archived) {
    const handleUnarchive = async () => {
      try {
        await updateCollection({ id: collection.id, archived: false }).unwrap();
        void dispatch(
          addUndo({
            message: t`"${collection.name}" has been unarchived`,
            action: async () => {
              await updateCollection({ id: collection.id, archived: true });
              invalidateTags();
            },
          }),
        );
        invalidateTags();
      } catch (error) {
        void dispatch(
          addUndo({
            message: t`"${collection.name}" could not be unarchived`,
            icon: "warning",
          }),
        );
      }
    };

    const label =
      collection.namespace === "snippets"
        ? t`Unarchive snippet folder`
        : t`Unarchive collection`;

    return (
      <Tooltip label={label}>
        <ActionIcon
          aria-label={label}
          size="md"
          onClick={(event) => {
            event.stopPropagation();
            void handleUnarchive();
          }}
        >
          <FixedSizeIcon name="unarchive" c="text-primary" />
        </ActionIcon>
      </Tooltip>
    );
  }

  const optionsLabel =
    collection.namespace === "snippets"
      ? t`Snippet folder options`
      : t`Collection options`;

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
              onClick={toggleEditModal}
            >
              {collection.namespace === "snippets"
                ? t`Edit folder details`
                : t`Edit collection details`}
            </Menu.Item>
          )}
          {showPermissionsOption && (
            <Menu.Item
              leftSection={<Icon name="lock" />}
              onClick={togglePermissionsModal}
            >
              {t`Change permissions`}
            </Menu.Item>
          )}
          {!isRoot && (
            <Menu.Item
              leftSection={<Icon name="archive" />}
              onClick={onArchiveClick}
              c="error"
            >
              {t`Archive`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      {confirmationModal}
      {isEditModalOpen && (
        <EditCollectionModal
          collection={collection}
          onSave={onSave}
          onClose={toggleEditModal}
        />
      )}
      {isPermissionsModalOpen && collection.namespace === "snippets" && (
        <PLUGIN_SNIPPET_FOLDERS.CollectionPermissionsModal
          collectionId={collection.id}
          onClose={togglePermissionsModal}
        />
      )}
      {isPermissionsModalOpen && collection.namespace !== "snippets" && (
        <PLUGIN_LIBRARY.CollectionPermissionsModal
          collectionId={collection.id}
          namespace={collection.namespace}
          onClose={togglePermissionsModal}
        />
      )}
    </Box>
  );
}
