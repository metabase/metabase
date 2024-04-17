import { useMemo } from "react";

import { useCollectionListQuery } from "metabase/common/hooks";
import type {
  Collection,
  SearchModel,
  SearchRequest,
} from "metabase-types/api";

import type {
  EntityPickerOptions,
  ListProps,
  TypeWithModel,
} from "../../EntityPicker";
import { ItemList } from "../../EntityPicker";
import type { CollectionPickerItem } from "../types";

export const PersonalCollectionsItemList = <
  Id,
  Model extends SearchModel,
  Item extends TypeWithModel<Id, Model>,
  Query extends SearchRequest,
  Options extends EntityPickerOptions,
>({
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: ListProps<Id, Model, Item, Query, Options>) => {
  const {
    data: collections,
    error,
    isLoading,
  } = useCollectionListQuery({
    query: { "personal-only": true },
  });

  const topLevelPersonalCollections = useMemo(
    () => getSortedTopLevelPersonalCollections(collections),
    [collections],
  );

  return (
    <ItemList
      items={topLevelPersonalCollections}
      error={error}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
    />
  );
};

const getSortedTopLevelPersonalCollections = (
  personalCollections?: Collection[],
): CollectionPickerItem[] | null =>
  personalCollections
    ?.filter(isRootPersonalCollection)
    .map(
      (collection: Collection): CollectionPickerItem => ({
        ...collection,
        here: ["collection"], // until this endpoint gives this to us, pretend they all have content
        model: "collection",
      }),
    )
    .sort((a, b) => a?.name.localeCompare(b.name)) ?? null;

// the search api lacks `personal_owner_id` field, so we need this check to be different
// than when checking this elsewhere
const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === "/";
