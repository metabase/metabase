import type React from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Flex } from "metabase/ui";
import type { SearchListQuery } from "metabase-types/api";

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

const generateKey = (query?: SearchListQuery) =>
  JSON.stringify(query ?? "root");

export function NestedItemPicker<TItem extends TypeWithModel>({
  onFolderSelect,
  onItemSelect,
  options,
  path,
  isFolder,
  listResolver: ListResolver,
}: NestedItemPickerProps<TItem>) {
  const handleClick = (item: TItem) => {
    if (isFolder(item)) {
      onFolderSelect({ folder: item });
    } else {
      onItemSelect(item);
    }
  };

  return (
    <AutoScrollBox
      data-testid="nested-item-picker"
      contentHash={generateKey(path[path.length - 1].query)}
    >
      <Flex h="100%" w="fit-content">
        {path.map((level, index) => {
          const { query, selectedItem } = level;

          return (
            // @ts-expect-error -- we need to upgrade mantine to fix this type error
            <ListBox
              key={generateKey(query)}
              data-testid={`item-picker-level-${index}`}
            >
              <ErrorBoundary>
                <ListResolver
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: TItem) => handleClick(item)}
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
