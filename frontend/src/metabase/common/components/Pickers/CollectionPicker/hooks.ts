import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { isRootCollection } from "metabase/collections/utils";
import { useGetPersonalCollection, useSetting } from "metabase/common/hooks";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_LIBRARY, PLUGIN_TENANTS } from "metabase/plugins";
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

const getTenantSpecificCollectionsRoot = (): CollectionPickerItem | null => {
  const base = PLUGIN_TENANTS.TENANT_SPECIFIC_COLLECTIONS;
  if (!base) {
    return null;
  }
  return {
    ...base,
    can_write: false,
    model: "collection",
    location: "/",
    description: "",
    here: ["collection", "card", "dashboard"],
    below: ["collection"],
  };
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

  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery(undefined, { skip: !options.showDatabases });
  const databases = databaseData?.data ?? [];
  const tenantsEnabled = useSetting("use-tenants");
  const currentUser = useSelector(getUser);

  const { data: personalCollection, isLoading: isLoadingPersonalCollection } =
    useGetPersonalCollection();

  const { data: libraryCollection } = PLUGIN_LIBRARY.useGetLibraryCollection({
    skip: !options.showLibrary,
  });

  const {
    data: personalCollectionItems,
    isLoading: isLoadingPersonalCollectionItems,
  } = useListCollectionItemsQuery(
    personalCollection
      ? {
          id: personalCollection.id,
          models: ["collection", "dashboard"],
          limit: 0, // we only want total number of items
        }
      : skipToken,
  );
  const totalPersonalCollectionItems = personalCollectionItems?.total ?? 0;

  const {
    data: rootCollection,
    isLoading: isLoadingRootCollection,
    error: rootCollectionError,
  } = useGetCollectionQuery({ id: "root" });

  const items = useMemo(() => {
    const collectionItems: CollectionPickerItem[] = [];

    if (
      options?.restrictToNamespace === PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE
    ) {
      if (tenantsEnabled && currentUser) {
        collectionItems.push({
          name: t`Shared collections`,
          id: "tenant",
          namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
          here: ["collection", "card", "dashboard"],
          description: null,
          can_write: true,
          model: "collection",
          location: "/",
        });
      }
      return collectionItems;
    }

    if (
      options.showLibrary &&
      libraryCollection &&
      options.namespace !== "snippets" &&
      options.namespace !== "transforms"
    ) {
      collectionItems.push({
        ...libraryCollection,
        model: "collection",
        moderated_status: null,
      } as CollectionPickerItem);
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

    if (
      options?.showRootCollection ||
      options?.namespace === "snippets" ||
      options?.namespace === "transforms"
    ) {
      if (rootCollection && !rootCollectionError) {
        collectionItems.push({
          ...rootCollection,
          model: "collection",
          here: ["collection"],
          location: "/",
          name:
            options.namespace === "snippets"
              ? t`SQL snippets`
              : options.namespace === "transforms"
                ? t`Transforms`
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
      options?.namespace !== "transforms" &&
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
        name: t`Shared collections`,
        id: "tenant",
        namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
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
        name: t`Our data`,
        id: userTenantCollectionId,
        here: ["collection", "card", "dashboard"],
        description: null,
        can_write: true,
        model: "collection",
        location: "/",
        type: "tenant-specific-root-collection",
      });
    }

    if (shouldShowTenantCollections && isAdmin) {
      const tenantSpecificRoot = getTenantSpecificCollectionsRoot();
      if (tenantSpecificRoot) {
        collectionItems.push(tenantSpecificRoot);
      }
    }

    return collectionItems;
  }, [
    personalCollection,
    rootCollection,
    isAdmin,
    options,
    databases.length,
    rootCollectionError,
    totalPersonalCollectionItems,
    libraryCollection,
    tenantsEnabled,
    currentUser,
  ]);

  const isLoading =
    isLoadingDatabases ||
    isLoadingRootCollection ||
    isLoadingPersonalCollection ||
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
