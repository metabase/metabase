import { useEffect, useRef, useState } from "react";

import { Flex } from "metabase/ui";

import type { SearchResult } from "metabase-types/api";
import type { PickerState } from "../../types";
import { HorizontalScrollBox, ListBox } from "./NestedItemPicker.styled";

interface NestedItemPickerProps<T> {
  onFolderSelect: (folder?: Partial<T>) => Promise<T[]>;
  onItemSelect: (item: T) => void;
  folderModel: string;
  itemModel: string;
  initialState?: PickerState<T>;
}

export const NestedItemPicker = ({
  onFolderSelect,
  onItemSelect,
  folderModel,
  initialState = [],
}: NestedItemPickerProps<SearchResult>) => {
  const [stack, setStack] = useState(initialState ?? []);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFolderSelect = async (
    folder: SearchResult,
    levelIndex: number,
  ) => {
    const nextLevel = await onFolderSelect(folder);

    // FIXME do better
    const restOfStack = stack.slice(0, levelIndex + 1);
    restOfStack[restOfStack.length - 1].selectedItem = folder;

    setStack([...restOfStack, nextLevel]);

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

  useEffect(() => {
    if (
      containerRef.current !== null &&
      containerRef.current.clientWidth < containerRef.current.scrollWidth
    ) {
      const diff =
        containerRef.current.scrollWidth - containerRef.current.clientWidth;
      containerRef.current.scrollLeft += diff;
    }
  }, [containerRef]);

  const handleItemSelect = (item: SearchResult, levelIndex: number) => {
    const restOfStack = stack.slice(0, levelIndex + 1);
    restOfStack[restOfStack.length - 1].selectedItem = item;
    setStack(restOfStack);
    onItemSelect(item);
  };

  const handleClick = (item: SearchResult, levelIndex: number) => {
    if (folderModel.includes(item.model)) {
      handleFolderSelect(item, levelIndex);
    } else {
      handleItemSelect(item, levelIndex);
    }
  };

  return (
    <HorizontalScrollBox h="100%" ref={containerRef}>
      <Flex h="100%" w="fit-content">
        {stack.map((level, levelIndex) => {
          const { listComponent: ListComponent, ...rest } = level;

          return (
            <ListBox key={JSON.stringify(level).slice(0, 255)}>
              {/* <ItemList
              items={level?.items}
              onClick={item => handleClick(item, levelIndex)}
              selectedItem={level?.selectedItem}
              folderModel={folderModel}
            /> */}
              <ListComponent
                {...rest}
                onClick={item => handleClick(item, levelIndex)}
                selectedItem={level?.selectedItem}
                folderModel={folderModel}
              />
            </ListBox>
          );
        })}
      </Flex>
    </HorizontalScrollBox>
  );
};
