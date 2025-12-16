import { useMemo } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useGetPersonalCollection } from "metabase/common/hooks/use-get-personal-collection";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_DATA_STUDIO, PLUGIN_TENANTS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { CollectionNamespace } from "metabase-types/api";

import { useOmniPickerContext } from "../context";
import type { OmniPickerItem } from "../types";
import { getValidCollectionItemModels } from "../utils";

const personalCollectionsRoot: OmniPickerItem = {
  ...PERSONAL_COLLECTIONS,
  can_write: false,
  model: "collection",
  location: "/",
  here: ["collection"],
  below: ["collection"],
};

const getTenantSpecificCollectionsRoot = (): OmniPickerItem | null => {
  const base = PLUGIN_TENANTS.TENANT_SPECIFIC_COLLECTIONS;
  if (!base) {
    return null;
  }
  return {
    ...base,
    can_write: false,
    model: "collection",
    location: "/",
    here: ["collection", "card", "dashboard"],
    below: ["collection"],
  };
};

const namespaces: Record<string, CollectionNamespace[]> = {
  normal: [null, "analytics"],
  snippet: ["snippets"],
};

const getNamespacesFromModels = (
  models: OmniPickerItem["model"][],
): CollectionNamespace[] => {
  if (models.includes("snippet")) {
    return namespaces.snippet;
  }

  return namespaces.normal;
};

/**
 * This will generate a list of the top level items for the entity picker
 */
export const useRootItems = () => {
  const { options, models, searchQuery } = useOmniPickerContext();
  const isAdmin = useSelector(getUserIsAdmin);
  const namespaces = getNamespacesFromModels(models);

  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery(undefined, { skip: !options.showDatabases });
  const databases = databaseData?.data ?? [];
  const tenantsEnabled = useSetting("use-tenants");

  const { data: personalCollection, isLoading: isLoadingPersonalCollection } =
    useGetPersonalCollection();

  const { data: libraryCollection } =
    PLUGIN_DATA_STUDIO.useGetLibraryCollection({
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
    isLoading: isLoadingRootCollecton,
    error: rootCollectionError,
  } = useGetCollectionQuery({ id: "root" });
  const currentUser = useSelector(getCurrentUser);

  const items = useMemo(() => {
    const collectionItems: OmniPickerItem[] = [];
    const validCollectionModels = getValidCollectionItemModels(models);

    if (searchQuery) {
      collectionItems.push({
        id: "search-results",
        can_write: false,
        model: "collection",
        name: t`Search results for "${searchQuery}"`,
        below: validCollectionModels,
      });
    }

    if (
      options?.restrictToNamespace === PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE
    ) {
      if (tenantsEnabled && currentUser) {
        collectionItems.push({
          name: t`Shared collections`,
          id: "tenant",
          namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
          here: ["collection", "card", "dashboard"],
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
      options.namespace !== "snippets"
    ) {
      collectionItems.push({
        ...libraryCollection,
        model: "collection",
        can_write: false,
        location: "/",
      });
    }

    if (options.showRecents) {
      collectionItems.push({
        id: "recents",
        name: t`Recent items`,
        model: "collection",
        can_write: false,
        location: "/",
        here: validCollectionModels,
      });
    }

    if (options.showDatabases && databases.length > 0) {
      collectionItems.push({
        id: "databases",
        name: t`Databases`,
        model: "collection",
        can_write: false,
        location: "/",
        here: ["collection"],
        below: ["table"],
      });
    }

    if (options.showRootCollection || namespaces.includes("snippets")) {
      if (rootCollection && !rootCollectionError) {
        collectionItems.push({
          ...rootCollection,
          model: "collection",
          here: ["collection"],
          location: "/",
          below: validCollectionModels,
          can_write: namespaces.includes("snippets")
            ? false
            : rootCollection.can_write,
          name: namespaces.includes("snippets")
            ? t`SQL snippets`
            : rootCollection.name,
        });
      } else if (rootCollectionError) {
        collectionItems.push({
          name: t`Collections`,
          id: "root",
          here: ["collection"],
          can_write: false,
          model: "collection",
          location: "/",
        });
      }
    }

    if (
      options.showPersonalCollections &&
      !namespaces.includes("snippets") &&
      !!personalCollection
    ) {
      collectionItems.push({
        ...personalCollection,
        here: totalPersonalCollectionItems ? ["collection"] : [],
        below: totalPersonalCollectionItems ? validCollectionModels : [],
        model: "collection",
        can_write: true,
      });

      if (isAdmin) {
        collectionItems.push({
          ...personalCollectionsRoot,
          here: ["collection"],
          below: validCollectionModels,
          location: "/",
        });
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
    searchQuery,
    personalCollection,
    rootCollection,
    isAdmin,
    options,
    databases.length,
    rootCollectionError,
    totalPersonalCollectionItems,
    libraryCollection,
    namespaces,
    models,
    tenantsEnabled,
    currentUser,
  ]);

  const isLoading =
    isLoadingDatabases ||
    isLoadingRootCollecton ||
    isLoadingPersonalCollection ||
    isLoadingPersonalCollectionItems;

  return { items, isLoading };
};
