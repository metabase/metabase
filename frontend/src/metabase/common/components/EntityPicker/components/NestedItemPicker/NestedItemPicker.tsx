import type { ComponentType } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Flex } from "metabase/ui";

import type {
  EntityPickerOptions,
  ListProps,
  PickerState,
  IsFolder,
  TypeWithModel,
} from "../../types";
import { AutoScrollBox } from "../AutoScrollBox";

import { ListBox } from "./NestedItemPicker.styled";

export interface NestedItemPickerProps<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
  Options extends EntityPickerOptions,
> {
  onFolderSelect: ({ folder }: { folder: Item }) => void;
  onItemSelect: (item: Item) => void;
  generateKey: (query?: Query) => string;
  itemName: string;
  options: Options;
  path: PickerState<Item, Query>;
  isFolder: IsFolder<Id, Model, Item>;
  listResolver: ComponentType<ListProps<Id, Model, Item, Query, Options>>;
}

export function NestedItemPicker<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
  Options extends EntityPickerOptions,
>({
  onFolderSelect,
  onItemSelect,
  generateKey,
  options,
  path,
  isFolder,
  listResolver: ListResolver,
}: NestedItemPickerProps<Id, Model, Item, Query, Options>) {
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
