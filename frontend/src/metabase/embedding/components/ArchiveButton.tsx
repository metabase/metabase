import { useDisclosure } from "@mantine/hooks";
import { useAsyncFn } from "react-use";
import { c, t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { canArchiveItem } from "metabase/collections/utils";
import { ActionIcon, Icon, Loader, Menu } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import S from "./ArchiveButton.module.css";

interface ArchiveButtonProps {
  item: CollectionItem;
}
export function ArchiveButton({ item }: ArchiveButtonProps) {
  const { data: collection } = useGetCollectionQuery({
    id: item.collection_id ?? "root",
  });
  const canArchive = collection ? canArchiveItem(item, collection) : false;
  const [dropdownOpened, dropdownActions] = useDisclosure();

  const [{ loading: isArchiving }, handleArchive] = useAsyncFn(() => {
    dropdownActions.close();
    return item.setArchived?.(true) || Promise.resolve();
  });

  if (!canArchive) {
    return null;
  }

  return (
    <Menu
      opened={dropdownOpened}
      onClose={() => dropdownActions.close()}
      position="bottom-end"
    >
      <Menu.Target>
        <ActionIcon
          aria-label={c(
            "button that opens a actions dropdown e.g. Delete this row",
          ).t`Actions`}
          variant="subtle"
          onClick={dropdownActions.open}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {isArchiving ? (
          <Menu.Item
            disabled
            leftSection={<Loader size="xs" color="var(--mb-color-danger)" />}
            className={S.archiveMenuItem}
          >
            {t`Moving to trash`}
          </Menu.Item>
        ) : (
          <Menu.Item
            leftSection={<Icon name="trash" aria-hidden />}
            onClick={handleArchive}
            className={S.archiveMenuItem}
          >
            {t`Move to trash`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
