import { Flex } from "metabase/ui";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import ErrorBoundary from "metabase/ErrorBoundary";
import type { PickerState, PickerItem, EntityPickerOptions } from "../../types";
import type { EntityItemListProps } from "../ItemList";
import {
  RootItemList,
  EntityItemList,
  PersonalCollectionsItemList,
} from "../ItemList";
import { ListBox } from "./NestedItemPicker.styled";
import { AutoScrollBox } from "./AutoScrollBox";

interface NestedItemPickerProps<T> {
  onFolderSelect: ({ folder }: { folder: T }) => void;
  onItemSelect: (item: T) => void;
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
}: NestedItemPickerProps<PickerItem>) => {
  const handleFolderSelect = (folder: PickerItem) => {
    onFolderSelect({ folder });
  };

  const handleClick = (item: PickerItem) => {
    if (folderModel.includes(item.model)) {
      handleFolderSelect(item);
    } else {
      onItemSelect(item);
    }
  };

  return (
    <AutoScrollBox>
      <Flex h="100%" w="fit-content">
        {path.map(level => {
          const { query, selectedItem } = level;

          return (
            <ListBox key={JSON.stringify(query ?? "root").slice(0, 255)}>
              <ErrorBoundary>
                <ListComponent
                  query={query}
                  selectedItem={selectedItem}
                  options={options}
                  onClick={(item: PickerItem) => handleClick(item)}
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
  onClick,
  selectedItem,
  folderModel,
  options,
  query,
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
