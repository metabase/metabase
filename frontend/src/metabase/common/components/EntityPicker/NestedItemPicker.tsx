import { useState } from "react";

import { ScrollArea } from "@mantine/core"; // TODO, get this into metabase-ui

import { Flex, Text, Box, NavLink } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

import type { PickerState } from "./types";
import { PickerColumn } from "./EntityPicker.styled";

interface NestedItemPickerProps<FolderType, ItemType> {
  onFolderSelect: (folder?: FolderType) => Promise<any[]>;
  onItemSelect: (item: ItemType) => void;
  folderModel: string;
  itemModel: string;
  initialState?: PickerState<FolderType | ItemType>;
}

function isSelectedItem(item: any, selectedItem: any) {
  return item.id === selectedItem?.id && item.model === selectedItem?.model;
}

export function NestedItemPicker({
  onFolderSelect,
  onItemSelect,
  folderModel,
  initialState = [],
}: NestedItemPickerProps<any, any /* how to derive the generic? */>) {
  const [stack, setStack] =
    useState<PickerState<any /* how to derive the generic? */>>(initialState);

  const handleFolderSelect = async (folder: any, levelIndex: number) => {
    const children = await onFolderSelect(folder);

    // FIXME do better
    const restOfStack = stack.slice(0, levelIndex + 1);
    restOfStack[restOfStack.length - 1].selectedItem = folder;

    setStack([...restOfStack, { items: children, selectedItem: null }]);
  };

  const handleItemSelect = (item: any) => {
    onItemSelect(item);
  };

  const handleClick = (item: any, levelIndex: number) => {
    if (folderModel.includes(item.model)) {
      handleFolderSelect(item, levelIndex);
    } else {
      handleItemSelect(item);
    }
  };

  return (
    <ScrollArea type="hover">
      <Flex>
        {stack.map((level, levelIndex) => (
          <ItemList
            // key={levelIndex} // FIXME: bad
            items={level?.items}
            onClick={item => handleClick(item, levelIndex)}
            selectedItem={level?.selectedItem}
            folderModel={folderModel}
          />
        ))}
      </Flex>
    </ScrollArea>
  );
}

function ItemList({
  items,
  onClick,
  selectedItem,
  folderModel,
}: {
  items: any[];
  onClick: (item: any) => void;
  selectedItem: any;
  folderModel: string;
}) {
  if (!items) {
    return null;
  }

  if (!items.length) {
    return (
      <Box miw={310}>
        <Text align="center" p="lg">No items</Text>
      </Box>
    );
  }

  return (
    <ScrollArea miw={310} type="auto">
      <PickerColumn activeList={!selectedItem}>
        {items.map(item => {
          const isFolder = folderModel.includes(item.model);
          const isSelected = isSelectedItem(item, selectedItem);
          return (
            <div key={item.model + item.id}>
              <NavLink
                key={item.model + item.id}
                label={item.name}
                active={isSelected}
                icon={
                  <Icon name={isFolder ? "folder" : item.model || "table"} />
                }
                rightSection={isFolder ? undefined : null}
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
}
