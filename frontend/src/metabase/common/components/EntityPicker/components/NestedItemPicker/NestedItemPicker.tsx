import type { ComponentType } from "react";
import { useState } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import type {
  TablePickerStatePath,
  TablePickerValue,
} from "metabase/common/components/Pickers/TablePicker";
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
  initialValue?: TablePickerValue;
  isFolder: IsFolder<Id, Model, Item>;
  listResolver: ComponentType<ListProps<Id, Model, Item, Query, Options>>;
  shouldDisableItem?: (item: Item) => boolean;
  shouldShowItem?: (item: Item) => boolean;
  tablesPath?: TablePickerStatePath;
  onTablesPathChange?: (tablesPath: TablePickerStatePath) => void;
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
  initialValue,
  tablesPath,
  onTablesPathChange,
}: NestedItemPickerProps<Id, Model, Item, Query, Options>) {
  const handleClick = (item: Item) => {
    if (isFolder(item)) {
      onFolderSelect({ folder: item });
    } else {
      onItemSelect(item);
    }
  };
  const [hashBuster, setHashBuster] = useState(0);

  const lastSelectedItem = findLastSelectedItem(path);

  return (
    <AutoScrollBox
      data-testid="nested-item-picker"
      contentHash={generateKey(path[path.length - 1].query) + hashBuster}
    >
      <Flex h="100%" w="fit-content">
        {path.map((level, index) => {
          const { query, selectedItem, entity } = level;
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
                  entity={entity}
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: Item) => handleClick(item)}
                  isCurrentLevel={isCurrentLevel}
                  shouldDisableItem={shouldDisableItem}
                  shouldShowItem={shouldShowItem}
                  isFolder={isFolder}
                  refresh={() => setHashBuster((b) => b + 1)}
                  initialValue={initialValue}
                  tablesPath={tablesPath}
                  onTablesPathChange={onTablesPathChange}
                />
              </ErrorBoundary>
            </ListBox>
          );
        })}
      </Flex>
    </AutoScrollBox>
  );
}
