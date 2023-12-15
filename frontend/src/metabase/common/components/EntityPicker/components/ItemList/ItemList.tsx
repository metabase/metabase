import { Text, Box, ScrollArea, NavLink } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { SearchResult } from "metabase-types/api";
import { getIcon, isSelectedItem } from "../../utils";
import { PickerColumn } from "./ItemList.styled";

export const ItemList = ({
  items,
  onClick,
  selectedItem,
  folderModel,
}: {
  items: SearchResult[];
  onClick: (item: SearchResult) => void;
  selectedItem: SearchResult | null;
  folderModel: string;
}) => {
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
            <div key={item.model + item.id}>
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
