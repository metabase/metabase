import type { ComponentType } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Flex } from "metabase/ui";

import type {
  EntityPickerOptions,
  ListProps,
  PickerState,
  IsFolder,
  TypeWithModel,
  PickerStateItem,
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
  generateKey: (item?: PickerStateItem<Model, Item, Query>) => string;
  itemName: string;
  options: Options;
  path: PickerState<Model, Item, Query>;
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
  const lastPathItem = path.at(-1);

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
      contentHash={generateKey(lastPathItem)}
    >
      <Flex h="100%" w="fit-content">
        {path.map((level, index) => {
          const { model, query, selectedItem } = level;
          const isCurrentLevel = getIsHighlighted(path, index, isFolder);

          return (
            <ListBox
              key={generateKey(level)}
              data-testid={`item-picker-level-${index}`}
            >
              <ErrorBoundary>
                <ListResolver
                  model={model}
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: Item) => handleClick(item)}
                  isCurrentLevel={isCurrentLevel}
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

const getIsHighlighted = <
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
>(
  path: PickerState<Model, Item, Query>,
  index: number,
  isFolder: IsFolder<Id, Model, Item>,
) => {
  const level = path[index];
  const nextLevel = path[index + 1];
  const { selectedItem } = level;

  if (!selectedItem) {
    return false;
  }

  if (isFolder(selectedItem)) {
    const nextLevelSelectedItem = nextLevel?.selectedItem;
    return nextLevelSelectedItem != null;
  }

  return true;
};
