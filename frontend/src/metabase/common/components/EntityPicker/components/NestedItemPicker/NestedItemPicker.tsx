import { useEffect, useRef, useState } from "react";

import { Flex } from "metabase/ui";

import type { SearchResult } from "metabase-types/api";
import type { PickerState, PickerStateItem } from "../../types";
import { HorizontalScrollBox, ListBox } from "./NestedItemPicker.styled";

interface NestedItemPickerProps<T> {
  onFolderSelect: ({
    folder,
    level,
  }: {
    folder?: Partial<T>;
    level: number;
  }) => void;
  onItemSelect: ({ item, level }: { item: T; level: number }) => void;
  folderModel: string;
  itemModel: string;
  path: PickerState<T>;
}

export const NestedItemPicker = ({
  onFolderSelect,
  onItemSelect,
  folderModel,
  path,
}: NestedItemPickerProps<SearchResult>) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFolderSelect = (folder: SearchResult, levelIndex: number) => {
    onFolderSelect({ folder, level: levelIndex });

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

  const handleClick = (item: SearchResult, levelIndex: number) => {
    if (folderModel.includes(item.model)) {
      handleFolderSelect(item, levelIndex);
    } else {
      onItemSelect({ item, level: levelIndex });
    }
  };

  return (
    <HorizontalScrollBox h="100%" ref={containerRef}>
      <Flex h="100%" w="fit-content">
        {path.map((level, levelIndex) => {
          const { ListComponent, ...rest } = level;

          return (
            <ListBox key={JSON.stringify(level).slice(0, 255)}>
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
