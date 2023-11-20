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

export interface NestedItemPickerProps<
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
> {
  onFolderSelect: ({ folder }: { folder: TFolder }) => void;
  onItemSelect: (item: TItem) => void;
  itemName: string;
  options: EntityPickerOptions;
  path: PickerState<TFolder>;
  isFolder: TisFolder<TItem, TFolder>;
}

export function NestedItemPicker<
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
>({
  onFolderSelect,
  onItemSelect,
  itemName,
  options,
  path,
  isFolder,
}: NestedItemPickerProps<TItem, TFolder>) {
  const handleFolderSelect = (folder: TFolder) => {
    onFolderSelect({ folder });
  };

  const handleClick = (item: TItem | TFolder) => {
    if (isFolder(item)) {
      handleFolderSelect(item as TFolder);
    } else {
      onItemSelect(item as TItem);
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
                  onClick={(item: TItem | TFolder) => handleClick(item)}
                  itemName={itemName}
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
}: EntityItemListProps<CollectionPickerItem, CollectionPickerItem> & {
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
    />
  );
}
