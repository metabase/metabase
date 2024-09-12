import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
} from "metabase/api";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { useSelector } from "metabase/lib/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type { Collection } from "metabase-types/api";

import type { CollectionItemListProps, CollectionPickerItem } from "./types";

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
export const useRootCollectionPickerItems = (
  options: CollectionItemListProps["options"],
) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const currentUser = useSelector(getUser);

  const { data: personalCollection, isLoading: isLoadingPersonalCollecton } =
    useGetCollectionQuery(
      currentUser?.personal_collection_id
        ? { id: currentUser.personal_collection_id }
        : skipToken,
    );

  const {
    data: personalCollectionItems,
    isLoading: isLoadingPersonalCollectionItems,
  } = useListCollectionItemsQuery(
    currentUser?.personal_collection_id
      ? {
          id: currentUser?.personal_collection_id,
          models: ["collection"],
        }
      : skipToken,
  );

  const {
    data: rootCollection,
    isLoading: isLoadingRootCollecton,
    error: rootCollectionError,
  } = useGetCollectionQuery({ id: "root" });

  const items = useMemo(() => {
    const collectionItems: CollectionPickerItem[] = [];

    if (options.showRootCollection || options.namespace === "snippets") {
      if (rootCollection && !rootCollectionError) {
        collectionItems.push({
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
        collectionItems.push({
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
      collectionItems.push({
        ...personalCollection,
        here: personalCollectionItems?.data.length ? ["collection"] : [],
        model: "collection",
        can_write: true,
      });

      if (isAdmin) {
        collectionItems.push(personalCollectionsRoot);
      }
    }

    return collectionItems;
  }, [
    currentUser,
    personalCollection,
    rootCollection,
    isAdmin,
    options,
    rootCollectionError,
    personalCollectionItems,
  ]);

  const isLoading =
    isLoadingRootCollecton ||
    isLoadingPersonalCollecton ||
    isLoadingPersonalCollectionItems;

  return { items, isLoading };
};

export const useEnsureCollectionSelected = ({
  currentCollection,
  enabled,
  options,
  useRootCollection,
  onItemSelect,
}: {
  currentCollection: Collection | undefined;
  enabled: boolean;
  options: CollectionItemListProps["options"];
  useRootCollection: boolean;
  onItemSelect: (
    item: CollectionPickerItem,
    options?: { autoSelected?: boolean },
  ) => void;
}) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const { items } = useRootCollectionPickerItems(options);

  const currentCollectionItem: CollectionPickerItem | undefined =
    useMemo(() => {
      if (!currentCollection) {
        return undefined;
      }

      return { ...currentCollection, model: "collection" };
    }, [currentCollection]);

  const defaultCollectionItem = useRootCollection
    ? items[0]
    : currentCollectionItem;

  useEffect(() => {
    if (isEnabled && defaultCollectionItem) {
      onItemSelect(defaultCollectionItem, { autoSelected: true });
      setIsEnabled(false); // ensure this effect runs only once
    }
  }, [isEnabled, defaultCollectionItem, onItemSelect]);
};
