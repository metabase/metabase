import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import type { SearchModel, SearchRequest } from "metabase-types/api";

import type {
  EntityPickerOptions,
  ListProps,
  TypeWithModel,
} from "../../EntityPicker";

import { PersonalCollectionsItemList } from "./PersonalCollectionItemList";
import { RootItemList } from "./RootItemList";
import { SearchItemList } from "./SearchItemList";

export const CollectionItemPickerResolver = <
  Id,
  Model extends SearchModel,
  Item extends TypeWithModel<Id, Model>,
  Query extends SearchRequest,
  Options extends EntityPickerOptions,
>({
  onClick,
  selectedItem,
  options,
  query,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: ListProps<Id, Model, Item, Query, Options>) => {
  if (!query) {
    return (
      <RootItemList
        options={options}
        selectedItem={selectedItem}
        onClick={onClick}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
      />
    );
  }

  if (query.collection === PERSONAL_COLLECTIONS.id) {
    return (
      <PersonalCollectionsItemList
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        options={options}
      />
    );
  }

  return (
    <SearchItemList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
      options={options}
    />
  );
};
