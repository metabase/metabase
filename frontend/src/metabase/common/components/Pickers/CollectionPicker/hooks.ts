import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { isRootCollection } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type { Collection, Dashboard } from "metabase-types/api";

import { SHARED_TENANT_NAMESPACE } from "../utils";

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
  const currentUser = useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);

  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery(undefined, { skip: !options.showDatabases });
  const databases = databaseData?.data ?? [];
  const tenantsEnabled = useSetting("use-tenants");

  const { data: personalCollection, isLoading: isLoadingPersonalCollecton } =
    useGetCollectionQuery(
      currentUser?.personal_collection_id
        ? { id: currentUser.personal_collection_id }
        : skipToken,
    );

  const { data: libraryCollection } =
    PLUGIN_DATA_STUDIO.useGetLibraryCollection({
      skip: !options.showLibrary,
    });

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

    // If restricted to shared-tenant namespace, only show tenant root
    if (options?.restrictToNamespace === SHARED_TENANT_NAMESPACE) {
      if (tenantsEnabled && currentUser) {
        collectionItems.push({
          name: t`Shared Tenant Collections`,
          id: "tenant",
          namespace: SHARED_TENANT_NAMESPACE,
          here: ["collection", "card", "dashboard"],
          description: null,
          can_write: true,
          model: "collection",
          location: "/",
        });
      }
      return collectionItems;
    }

    if (options?.showLibrary && libraryCollection) {
      collectionItems.push({
        ...libraryCollection,
        model: "collection",
        moderated_status: null,
      });
    }

    if (options?.showDatabases && databases.length > 0) {
      collectionItems.push({
        id: "databases",
        name: t`Databases`,
        model: "collection",
        can_write: true,
        location: "/",
        here: ["collection"],
        below: ["table"],
      });
    }

    if (options?.showRootCollection || options?.namespace === "snippets") {
      if (rootCollection && !rootCollectionError) {
        collectionItems.push({
          ...rootCollection,
          model: "collection",
          here: ["collection"],
          location: "/",
          name:
            options?.namespace === "snippets"
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
      options?.showPersonalCollections &&
      options?.namespace !== "snippets" &&
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

    // Only show tenant collections if NOT restricted to a different namespace
    // When restrictToNamespace is "default", we exclude tenant collections
    const shouldShowTenantCollections =
      tenantsEnabled &&
      currentUser &&
      options?.restrictToNamespace !== "default";

    if (shouldShowTenantCollections) {
      collectionItems.push({
        name: t`Shared Tenant Collections`,
        id: "tenant",
        namespace: SHARED_TENANT_NAMESPACE,
        here: ["collection", "card", "dashboard"],
        description: null,
        can_write: true,
        model: "collection",
        location: "/",
      });
    }

    const userTenantCollectionId = currentUser?.tenant_collection_id;
    if (shouldShowTenantCollections && userTenantCollectionId) {
      collectionItems.push({
        name: t`My Tenant Collection`,
        id: userTenantCollectionId,
        here: ["collection", "card", "dashboard"],
        description: null,
        can_write: true,
        model: "collection",
        location: "/",
        type: "tenant-specific-root-collection",
      });
    }

    return collectionItems;
  }, [
    currentUser,
    personalCollection,
    rootCollection,
    isAdmin,
    options,
    databases.length,
    rootCollectionError,
    totalPersonalCollectionItems,
    libraryCollection,
    tenantsEnabled,
  ]);

  const isLoading =
    isLoadingDatabases ||
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
    ? items.find(isRootCollection)
    : currentCollectionItem;

  useEffect(() => {
    if (isEnabled && defaultCollectionItem) {
      onInit(defaultCollectionItem);
      setIsEnabled(false); // ensure this effect runs only once
    }
  }, [isEnabled, defaultCollectionItem, onInit]);
};
