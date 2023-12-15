import { useRef, useState } from "react";

import { Flex } from "metabase/ui";

import type { PickerState } from "../../types";
import { ItemList } from "../ItemList";
import { HorizontalScrollBox, ListBox } from "./NestedItemPicker.styled";

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
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFolderSelect = async (folder: any, levelIndex: number) => {
    const children = await onFolderSelect(folder);

    // FIXME do better
    const restOfStack = stack.slice(0, levelIndex + 1);
    restOfStack[restOfStack.length - 1].selectedItem = folder;

    setStack([...restOfStack, { items: children, selectedItem: null }]);
    const intervalId = setInterval(() => {
      if (
        containerRef.current !== null &&
        containerRef.current.scrollLeft + containerRef.current.clientWidth <
          containerRef.current.scrollWidth
      ) {
        containerRef.current.scrollLeft += 25;
      } else {
        clearInterval(intervalId);
      }
    }, 10);
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
    <HorizontalScrollBox h="100%" ref={containerRef}>
      <Flex h="100%" w="fit-content">
        {stack.map((level, levelIndex) => (
          <ListBox key={JSON.stringify(level).slice(0, 255)}>
            <ItemList
              items={level?.items}
              onClick={item => handleClick(item, levelIndex)}
              selectedItem={level?.selectedItem}
              folderModel={folderModel}
            />
          </ListBox>
        ))}
      </Flex>
    </HorizontalScrollBox>
  );
}
