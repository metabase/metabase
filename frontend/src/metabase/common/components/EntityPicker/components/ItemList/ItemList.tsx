import { useRef } from "react";
import { useVirtualizer } from '@tanstack/react-virtual';
import { Box , Text, Box, ScrollArea, NavLink, Loader, Center, Icon } from 'metabase/ui';

import type { CollectionItem } from "metabase-types/api";
import { getIcon, isSelectedItem } from "../../utils";
import { PickerColumn } from "./ItemList.styled";


export const ItemList = ({
  items,
  isLoading = false,
  onClick,
  selectedItem,
  folderModel,
}: {
  items?: CollectionItem[];
  isLoading: boolean;
  onClick: (item: CollectionItem) => void;
  selectedItem: CollectionItem | null;
  folderModel: string;
}) => {
  const listRef = useRef<Box>(null);
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
      <PickerColumn ref={listRef}>
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
