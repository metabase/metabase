import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { isRootCollection } from "metabase/collections/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { SnippetCollectionMenuProps } from "metabase/plugins";
import { addUndo } from "metabase/redux/undo";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";

export function SnippetCollectionMenu({
  collection,
  onEditDetails,
  onChangePermissions,
}: SnippetCollectionMenuProps) {
  const dispatch = useDispatch();

  const isAdmin = useSelector(getUserIsAdmin);
  const [updateCollection] = useUpdateCollectionMutation();

  const isRoot = isRootCollection(collection);
  const isArchived = collection.archived;

  if (!collection.can_write) {
    return null;
  }

  const handleArchiveToggle = async () => {
    const wasArchived = collection.archived;
    try {
      await updateCollection({
        id: collection.id,
        archived: !wasArchived,
      }).unwrap();

      dispatch(
        addUndo({
          message: wasArchived
            ? t`"${collection.name}" has been unarchived`
            : t`"${collection.name}" has been archived`,
          undo: async () => {
            await updateCollection({
              id: collection.id,
              archived: wasArchived,
            });
          },
        }),
      );
    } catch (error) {
      console.error("Failed to update collection:", error);
    }
  };

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            w={24}
            h={24}
            c="text-secondary"
            size="compact-xs"
            variant="subtle"
            leftSection={<FixedSizeIcon name="ellipsis" size={16} />}
            aria-label={t`Snippet collection options`}
            onClick={(e) => e.stopPropagation()}
          />
        </Menu.Target>
        <Menu.Dropdown>
          {isArchived ? (
            <Menu.Item
              leftSection={<Icon name="unarchive" />}
              onClick={handleArchiveToggle}
            >
              {t`Unarchive`}
            </Menu.Item>
          ) : (
            <>
              {!isRoot && (
                <Menu.Item
                  leftSection={<Icon name="pencil" />}
                  onClick={() => onEditDetails(collection)}
                >
                  {t`Edit folder details`}
                </Menu.Item>
              )}
              {isAdmin && (
                <Menu.Item
                  leftSection={<Icon name="lock" />}
                  onClick={() => onChangePermissions(collection.id)}
                >
                  {t`Change permissions`}
                </Menu.Item>
              )}
              {!isRoot && (
                <Menu.Item
                  leftSection={<Icon name="archive" />}
                  onClick={handleArchiveToggle}
                  c="error"
                >
                  {t`Archive`}
                </Menu.Item>
              )}
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
