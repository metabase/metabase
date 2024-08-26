import type { ComponentType } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Flex } from "metabase/ui";

import type {
  EntityPickerOptions,
  IsFolder,
  ListProps,
  PickerState,
  TypeWithModel,
} from "../../types";
import { isSelectedItem } from "../../utils";
import { AutoScrollBox } from "../AutoScrollBox";

import { ListBox } from "./NestedItemPicker.styled";
import { findLastSelectedItem, generateKey } from "./utils";

export interface NestedItemPickerProps<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
  Options extends EntityPickerOptions,
> {
  onFolderSelect: ({ folder }: { folder: Item }) => void;
  onItemSelect: (item: Item) => void;
  options: Options;
  path: PickerState<Item, Query>;
  isFolder: IsFolder<Id, Model, Item>;
  listResolver: ComponentType<ListProps<Id, Model, Item, Query, Options>>;
  shouldDisableItem?: (item: Item) => boolean;
  shouldShowItem?: (item: Item) => boolean;
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
  options,
  path,
  isFolder,
  listResolver: ListResolver,
  shouldDisableItem,
  shouldShowItem,
}: NestedItemPickerProps<Id, Model, Item, Query, Options>) {
  const handleClick = (item: Item) => {
    if (isFolder(item)) {
      onFolderSelect({ folder: item });
    } else {
      onItemSelect(item);
    }
  };

  const lastSelectedItem = findLastSelectedItem(path);

  return (
    <AutoScrollBox
      data-testid="nested-item-picker"
      contentHash={generateKey(path[path.length - 1].query)}
    >
      <Flex h="100%" w="fit-content">
        {path.map((level, index) => {
          const { query, selectedItem } = level;
          const isCurrentLevel = Boolean(
            selectedItem &&
              lastSelectedItem &&
              isSelectedItem(selectedItem, lastSelectedItem),
          );

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
                  isCurrentLevel={isCurrentLevel}
                  shouldDisableItem={shouldDisableItem}
                  shouldShowItem={shouldShowItem}
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
