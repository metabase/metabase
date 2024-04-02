import { useMemo } from "react";
import { t } from "ttag";

import { useCollectionQuery, useSearchListQuery } from "metabase/common/hooks";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

import { ItemList } from "../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

const personalCollectionsRoot: CollectionPickerItem = {
  ...PERSONAL_COLLECTIONS,
  can_write: false,
  model: "collection",
  location: "/",
  description: "",
  here: ["collection"],
  below: ["collection"],
};

/**
 * This is a special item list that exists "above" our analytics and might include:
 * a) the highest-level collections the user can access (often "our analytics")
 * b) the user's personal collection
 * c) a top level folder including all personal collections (admin only)
 */
export const RootItemList = ({
  onClick,
  selectedItem,
  options,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: CollectionItemListProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const currentUser = useSelector(getUser);

  const { data: personalCollection, isLoading: isLoadingPersonalCollecton } =
    useCollectionQuery({
      id: currentUser?.personal_collection_id,
      enabled: !!currentUser?.personal_collection_id,
    });

  const {
    data: personalCollectionItems,
    isLoading: isLoadingPersonalCollectionItems,
  } = useSearchListQuery({
    query: {
      collection: currentUser?.personal_collection_id,
      models: ["collection"],
    },
    enabled: !!currentUser?.personal_collection_id,
  });

  const {
    data: rootCollection,
    isLoading: isLoadingRootCollecton,
    error: rootCollectionError,
  } = useCollectionQuery({ id: "root" });

  const data = useMemo(() => {
    const collectionsData: CollectionPickerItem[] = [];

    if (options.showRootCollection || options.namespace === "snippets") {
      if (rootCollection && !rootCollectionError) {
        collectionsData.push({
          ...rootCollection,
          model: "collection",
          here: ["collection"],
          location: "/",
          name:
            options.namespace === "snippets"
              ? t`Top folder`
              : rootCollection.name,
        });
      } else if (rootCollectionError) {
        collectionsData.push({
          name: t`Collections`,
          id: "root",
          here: ["collection"],
          description: null,
          can_write: false,
          model: "collection",
          location: "/",
        });
      }
    }

    if (
      options.showPersonalCollections &&
      options.namespace !== "snippets" &&
      currentUser &&
      !!personalCollection
    ) {
      collectionsData.push({
        ...personalCollection,
        here: personalCollectionItems?.length ? ["collection"] : [],
        model: "collection",
        can_write: true,
      });

      if (isAdmin) {
        collectionsData.push(personalCollectionsRoot);
      }
    }

    return collectionsData;
  }, [
    currentUser,
    personalCollection,
    rootCollection,
    isAdmin,
    options,
    rootCollectionError,
    personalCollectionItems,
  ]);

  return (
    <ItemList
      items={data}
      isLoading={
        isLoadingRootCollecton ||
        isLoadingPersonalCollecton ||
        isLoadingPersonalCollectionItems
      }
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
    />
  );
};
