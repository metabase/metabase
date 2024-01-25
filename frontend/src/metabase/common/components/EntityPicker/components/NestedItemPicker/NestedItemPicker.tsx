import { Flex } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import ErrorBoundary from "metabase/ErrorBoundary";
import type { PickerState, EntityPickerOptions } from "../../types";
import type { EntityItemListProps } from "../ItemList";
import { RootItemList, EntityItemList, PersonalCollectionsItemList  } from "../ItemList";
import {  ListBox } from "./NestedItemPicker.styled";
import { AutoScrollBox } from "./AutoScrollBox";


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
  options: EntityPickerOptions;
  path: PickerState<T>;
}

export const NestedItemPicker = ({
  onFolderSelect,
  onItemSelect,
  folderModel,
  options,
  path,
}: NestedItemPickerProps<SearchResult>) => {
  const handleFolderSelect = (folder: SearchResult, levelIndex: number) => {
    onFolderSelect({ folder, level: levelIndex });
  };

  const handleClick = (item: SearchResult, levelIndex: number) => {
    if (folderModel.includes(item.model)) {
      handleFolderSelect(item, levelIndex);
    } else {
      onItemSelect({ item, level: levelIndex });
    }
  };

  return (
    <AutoScrollBox>
      <Flex h="100%" w="fit-content">
        {path.map((level, levelIndex) => {
          const { query, selectedItem } = level;

          return (
            <ListBox key={JSON.stringify(query ?? 'root').slice(0, 255)}>
              <ErrorBoundary>
                <ListComponent
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: SearchResult ) => handleClick(item, levelIndex)}
                  folderModel={folderModel}
                />
              </ErrorBoundary>
            </ListBox>
          );
        })}
      </Flex>
    </AutoScrollBox>
  );
};

function ListComponent({
  onClick, selectedItem, folderModel, options, query
}: EntityItemListProps & { options: EntityPickerOptions }) {
  if (!query) {
    return (
      <RootItemList
        options={options}
        selectedItem={selectedItem}
        onClick={onClick}
        folderModel={folderModel}
      />
    );
  }

  if (query.collection === PERSONAL_COLLECTIONS.id) {
    return (
      <PersonalCollectionsItemList
        options={options}
        onClick={onClick}
        selectedItem={selectedItem}
        folderModel={folderModel}
      />
    );
  }

  return (
    <EntityItemList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      folderModel={folderModel}
    />
  );

}
