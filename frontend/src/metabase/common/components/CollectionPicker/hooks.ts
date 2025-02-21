import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useListCollectionItemsQuery,
} from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { useSelector } from "metabase/lib/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type { Collection, Dashboard } from "metabase-types/api";

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
          models: ["collection", "dashboard"],
          limit: 0, // we only want total number of items
        }
      : skipToken,
  );
  const totalPersonalCollectionItems = personalCollectionItems?.total ?? 0;

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
        here: totalPersonalCollectionItems ? ["collection"] : [],
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
    totalPersonalCollectionItems,
  ]);

  const isLoading =
    isLoadingRootCollecton ||
    isLoadingPersonalCollecton ||
    isLoadingPersonalCollectionItems;

  return { items, isLoading };
};

export const useEnsureCollectionSelected = ({
  currentCollection,
  currentDashboard,
  enabled,
  options,
  useRootCollection,
  onInit,
}: {
  currentCollection: Collection | undefined;
  currentDashboard: Dashboard | undefined;
  enabled: boolean;
  options: CollectionItemListProps["options"];
  useRootCollection: boolean;
  onInit: (item: CollectionPickerItem) => void;
}) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  // all this is done to acquire the name of the root collection, which getStateFromIdPath can't provide
  const { items } = useRootCollectionPickerItems(options);

  const currentCollectionItem: CollectionPickerItem | undefined =
    useMemo(() => {
      if (!currentCollection && !currentDashboard) {
        return undefined;
      }

      if (currentDashboard) {
        return {
          ...currentDashboard,
          model: "dashboard",
        };
      }

      if (currentCollection) {
        return {
          ...currentCollection,
          model: "collection",
        };
      }

      // not possible, but typescript isn't smart enough to figure this out
      // so the return types get messed up
    }, [currentCollection, currentDashboard]);

  const defaultCollectionItem = useRootCollection
    ? items[0]
    : currentCollectionItem;

  useEffect(() => {
    if (isEnabled && defaultCollectionItem) {
      onInit(defaultCollectionItem);
      setIsEnabled(false); // ensure this effect runs only once
    }
  }, [isEnabled, defaultCollectionItem, onInit]);
};

export const useGetInitialContainer = (
  initialValue?: Pick<CollectionPickerItem, "id" | "model"> | undefined,
) => {
  const isDashboard = initialValue?.model === "dashboard";

  const dashboardId = isDashboard ? Number(initialValue.id) : undefined;

  const { data: currentDashboard, error: dashboardError } =
    useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  const collectionId =
    isDashboard && currentDashboard
      ? currentDashboard?.collection_id
      : initialValue?.id;

  const requestCollectionId =
    (isValidCollectionId(collectionId) && collectionId) || "root";

  const { data: currentCollection, error: collectionError } =
    useGetCollectionQuery(
      !isDashboard || !!currentDashboard
        ? { id: requestCollectionId }
        : skipToken,
    );

  return {
    currentDashboard: currentDashboard,
    currentCollection,
    isLoading: !currentCollection && !collectionError,
    error: dashboardError ?? collectionError,
  };
};
