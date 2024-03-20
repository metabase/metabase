import type React from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Flex } from "metabase/ui";

import type {
  EntityPickerOptions,
  PickerState,
  TisFolder,
  TypeWithModel,
} from "../../types";
import { AutoScrollBox } from "../AutoScrollBox";
import type { EntityItemListProps } from "../ItemList";

import { ListBox } from "./NestedItemPicker.styled";

export interface NestedItemPickerProps<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
> {
  onFolderSelect: ({ folder }: { folder: Item }) => void;
  onItemSelect: (item: Item) => void;
  generateKey: (query?: Query) => string;
  itemName: string;
  options: EntityPickerOptions;
  path: PickerState<Item, Query>;
  isFolder: TisFolder<Id, Model, Item>;
  listResolver: React.FC<
    EntityItemListProps<Item> & {
      options: EntityPickerOptions;
    }
  >;
}

export function NestedItemPicker<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
>({
  onFolderSelect,
  onItemSelect,
  generateKey,
  options,
  path,
  isFolder,
  listResolver: ListResolver,
}: NestedItemPickerProps<Id, Model, Item, Query>) {
  const handleClick = (item: Item) => {
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
            <ListBox
              key={generateKey(query)}
              data-testid={`item-picker-level-${index}`}
            >
              <ErrorBoundary>
                <ListResolver
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: Item) => handleClick(item)}
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
