import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { canArchiveItem } from "metabase/collections/utils";
import { Button, Icon, Menu, Tooltip } from "metabase/ui";
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

  const buttonLabel = t`Move to trash`;

  return (
    <Menu opened={dropdownOpened} onClose={() => dropdownActions.close()}>
      <Tooltip
        label={buttonLabel}
        opened={dropdownOpened ? false : undefined}
        withArrow
      >
        <Menu.Target>
          <Button
            aria-label={buttonLabel}
            leftSection={<Icon name="trash" className={S.archiveIcon} />}
            variant="inverse"
            py="sm"
            px="md"
            onClick={dropdownActions.toggle}
          />
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown>
        <Menu.Item>
          <Button
            variant="filled"
            color="danger"
            fullWidth
            onClick={handleArchive}
          >{t`Move to trash`}</Button>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
