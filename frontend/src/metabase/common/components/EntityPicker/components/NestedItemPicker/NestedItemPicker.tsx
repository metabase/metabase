import ErrorBoundary from "metabase/ErrorBoundary";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { Flex } from "metabase/ui";

import type {
  EntityPickerOptions,
  TypeWithModel,
  CollectionPickerItem,
  PickerState,
  TisFolder,
} from "../../types";
import type { EntityItemListProps } from "../ItemList";
import {
  RootItemList,
  EntityItemList,
  PersonalCollectionsItemList,
} from "../ItemList";

import { AutoScrollBox } from "./AutoScrollBox";
import { ListBox } from "./NestedItemPicker.styled";

export interface NestedItemPickerProps<TItem extends TypeWithModel> {
  onFolderSelect: ({ folder }: { folder: TItem }) => void;
  onItemSelect: (item: TItem) => void;
  itemName: string;
  options: EntityPickerOptions;
  path: PickerState<TItem>;
  isFolder: TisFolder<TItem>;
}

export function NestedItemPicker<TItem extends TypeWithModel>({
  onFolderSelect,
  onItemSelect,
  itemName,
  options,
  path,
  isFolder,
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
                <ListComponent
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: TItem) => handleClick(item)}
                  itemName={itemName}
                  isCurrentLevel={index === path.length - 2}
                  // @ts-expect-error - don't worry it's fine
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

function ListComponent({
  onClick,
  selectedItem,
  itemName,
  options,
  query,
  isFolder,
  isCurrentLevel,
}: EntityItemListProps<CollectionPickerItem> & {
  options: EntityPickerOptions;
}) {
  if (!query) {
    return (
      <RootItemList
        options={options}
        selectedItem={selectedItem}
        onClick={onClick}
        itemName={itemName}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
      />
    );
  }

  if (query.collection === PERSONAL_COLLECTIONS.id) {
    return (
      <PersonalCollectionsItemList
        onClick={onClick}
        selectedItem={selectedItem}
        itemName={itemName}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
      />
    );
  }

  return (
    <EntityItemList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      itemName={itemName}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
    />
  );
}
