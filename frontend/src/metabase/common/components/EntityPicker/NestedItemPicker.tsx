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
    <ScrollArea>
      <Flex>
        {stack.map((level, levelIndex) => (
          <ItemList
            // key={levelIndex} // FIXME: bad
            items={level?.items}
            onClick={item => handleClick(item, levelIndex)}
            selectedId={level?.selectedItem?.id}
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
  selectedId,
  folderModel,
}: {
  items: any[];
  onClick: (item: any) => void;
  selectedId: number;
  folderModel: string;
}) {
  if (!items) {
    return null;
  }

  if (!items.length) {
    return (
      <Box>
        <Text>No items</Text>
      </Box>
    );
  }

  return (
    <ScrollArea miw={310}>
      <PickerColumn activeList={!selectedId}>
        {items.map(item => {
          const isFolder = folderModel.includes(item.model);
          const isSelected = isFolder && item.id === selectedId;
          return (
            <div key={item.model + item.id}>
              <NavLink
                label={item.name}
                active={isSelected}
                icon={
                  <Icon name={isFolder ? "folder" : item.model || "table"} />
                }
                onClick={e => {
                  e.preventDefault(); // prevent form submission
                  e.stopPropagation(); // prevent parent onClick
                  onClick(item);
                }}
                variant="light"
              />
            </div>
          );
        })}
      </PickerColumn>
    </ScrollArea>
  );
}
