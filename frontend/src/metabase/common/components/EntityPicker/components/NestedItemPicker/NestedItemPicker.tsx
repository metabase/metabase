import type React from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Flex } from "metabase/ui";

import type {
  EntityPickerOptions,
  TypeWithModel,
  PickerState,
  TisFolder,
} from "../../types";
import type { EntityItemListProps } from "../ItemList";

import { AutoScrollBox } from "./AutoScrollBox";
import { ListBox } from "./NestedItemPicker.styled";

export interface NestedItemPickerProps<TItem extends TypeWithModel> {
  onFolderSelect: ({ folder }: { folder: TItem }) => void;
  onItemSelect: (item: TItem) => void;
  itemName: string;
  options: EntityPickerOptions;
  path: PickerState<TItem>;
  isFolder: TisFolder<TItem>;
  listResolver: React.FC<
    EntityItemListProps<TItem> & {
      options: EntityPickerOptions;
    }
  >;
}

export function NestedItemPicker<TItem extends TypeWithModel>({
  onFolderSelect,
  onItemSelect,
  itemName,
  options,
  path,
  isFolder,
  listResolver: ListResolver,
}: NestedItemPickerProps<TItem>) {
  const handleFolderSelect = (folder: TItem) => {
    onFolderSelect({ folder });
  };

  const handleClick = (item: TItem) => {
    if (isFolder(item)) {
      handleFolderSelect(item);
    } else {
      onItemSelect(item);
    }
  };

  return (
    <AutoScrollBox data-testid="nested-item-picker">
      <Flex h="100%" w="fit-content">
        {path.map((level, index) => {
          const { query, selectedItem } = level;

          return (
            <ListBox
              key={JSON.stringify(query ?? "root").slice(0, 255)}
              data-testid={`item-picker-level-${index}`}
            >
              <ErrorBoundary>
                <ListResolver
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: TItem) => handleClick(item)}
                  itemName={itemName}
                  isCurrentLevel={index === path.length - 2}
                  isFolder={isFolder}
                />
              </ErrorBoundary>
            </ListBox>
          );
        })}
      </Flex>
    </AutoScrollBox>
  );
}
