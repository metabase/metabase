import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { canArchiveItem } from "metabase/collections/utils";
import { ActionIcon, Icon, Menu } from "metabase/ui";
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

  const handleArchive = () => {
    item.setArchived?.(true);
    dropdownActions.close();
  };

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
            "button that opens an actions dropdown e.g. Move this item to trash",
          ).t`Actions`}
          variant="subtle"
          onClick={dropdownActions.open}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="trash" aria-hidden />}
          onClick={handleArchive}
          className={S.archiveMenuItem}
        >
          {t`Move to trash`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
