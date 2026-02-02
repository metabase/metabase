import { useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import type { Collection } from "metabase-types/api";

import type { OmniPickerItem } from "../../types";
import { allCollectionModels } from "../../utils";

import { ItemList } from "./ItemList";

export const PersonalCollectionsItemList = ({
  pathIndex,
}: {
  pathIndex: number;
}) => {
  const {
    data: collections,
    error,
    isLoading,
  } = useListCollectionsQuery({
    "personal-only": true,
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
      pathIndex={pathIndex}
    />
  );
};

const getSortedTopLevelPersonalCollections = (
  personalCollections?: Collection[],
): OmniPickerItem[] | undefined =>
  personalCollections
    ?.filter(isRootPersonalCollection)
    .map(
      (collection: Collection): OmniPickerItem => ({
        ...collection,
        // until this endpoint gives this to us, pretend they all have content
        here: ["collection"],
        below: allCollectionModels,
        model: "collection",
      }),
    )
    .sort((a, b) => a?.name.localeCompare(b.name)) ?? undefined;

// the search api lacks `personal_owner_id` field, so we need this check to be different
// than when checking this elsewhere
const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === "/";
