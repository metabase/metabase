import {
  Box,
  Text,
  ScrollArea,
  NavLink,
  Loader,
  Center,
  Icon,
} from "metabase/ui";
import type { PickerItem } from "../../types";
import { getIcon, isSelectedItem } from "../../utils";
import { PickerColumn } from "./ItemList.styled";

export const ItemList = ({
  items,
  isLoading = false,
  onClick,
  selectedItem,
  folderModel,
}: {
  items?: PickerItem[];
  isLoading: boolean;
  onClick: (item: PickerItem) => void;
  selectedItem: PickerItem | null;
  folderModel: string;
}) => {
  if (isLoading) {
    return (
      <Box miw={310}>
        <Center p="lg">
          <Loader />
        </Center>
      </Box>
    );
  }

  if (!items) {
    return null;
  }

  if (!items.length) {
    return (
      <Box miw={310}>
        <Text align="center" p="lg">
          No items
        </Text>
      </Box>
    );
  }

  return (
    <ScrollArea h="100%">
      <PickerColumn>
        {items.map(item => {
          const isFolder = folderModel.includes(item.model);
          const isSelected = isSelectedItem(item, selectedItem);
          return (
            <div key={`${item.model ?? "collection"}-${item.id}`}>
              <NavLink
                rightSection={
                  isFolder ? <Icon name="chevronright" size={10} /> : null
                }
                label={item.name}
                active={isSelected}
                icon={<Icon name={isFolder ? "folder" : getIcon(item)} />}
                onClick={e => {
                  e.preventDefault(); // prevent form submission
                  e.stopPropagation(); // prevent parent onClick
                  onClick(item);
                }}
                variant="light"
                mb="xs"
              />
            </div>
          );
        })}
      </PickerColumn>
    </ScrollArea>
  );
};
