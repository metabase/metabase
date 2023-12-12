import { useState } from "react";

import { Flex, Text, Box, NavLink, ScrollArea } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

import type { PickerState } from "./types";
import { PickerColumn, ListBox } from "./EntityPicker.styled";
import { entityForObject } from "metabase/lib/schema";

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

  const handleItemSelect = (item: any, levelIndex: number) => {
    const restOfStack = stack.slice(0, levelIndex + 1);
    restOfStack[restOfStack.length - 1].selectedItem = item;
    setStack(restOfStack);
    onItemSelect(item);
  };

  const handleClick = (item: any, levelIndex: number) => {
    if (folderModel.includes(item.model)) {
      handleFolderSelect(item, levelIndex);
    } else {
      handleItemSelect(item, levelIndex);
    }
  };

  return (
    <Box
      style={{
        height: "100%",
        overflowX: "auto",
      }}
    >
      <Flex
        style={{
          width: "fit-content",
          height: "100%",
        }}
      >
        {stack.map((level, levelIndex) => (
          <ListBox>
            <ItemList
              // key={levelIndex} // FIXME: bad
              items={level?.items}
              onClick={item => handleClick(item, levelIndex)}
              selectedItem={level?.selectedItem}
              folderModel={folderModel}
            />
          </ListBox>
        ))}
      </Flex>
    </Box>
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
}

const getIcon = item => {
  const entity = entityForObject(item);
  return entity?.objectSelectors?.getIcon?.(item)?.name || "table";
};
