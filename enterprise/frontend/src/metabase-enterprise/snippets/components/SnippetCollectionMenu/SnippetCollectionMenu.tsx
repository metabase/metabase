import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { isRootCollection } from "metabase/collections/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { SnippetCollectionMenuProps } from "metabase/plugins";
import { addUndo } from "metabase/redux/undo";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Icon, Menu } from "metabase/ui";

import S from "./SnippetCollectionMenu.module.css";

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
    <Box onClick={(e) => e.stopPropagation()} className={S.root}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            variant="subtle"
            p={0}
            h={20}
            w={20}
            c="text-medium"
            aria-label={t`Collection options`}
          >
            <Icon name="ellipsis" size={16} />
          </Button>
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
