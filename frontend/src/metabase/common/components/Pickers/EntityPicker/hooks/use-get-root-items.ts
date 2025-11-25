import { useState } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useListCollectionItemsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import {
  useGetPersonalCollection,
  useHasTokenFeature,
  useSetting,
} from "metabase/common/hooks";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { type DispatchFn, useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_DATA_STUDIO, PLUGIN_TENANTS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type {
  Collection,
  CollectionNamespace,
  Database,
  User,
} from "metabase-types/api";

import { useOmniPickerContext } from "../context";
import type {
  EntityPickerOptions,
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "../types";
import { getValidCollectionItemModels } from "../utils";

import { getRootCollectionItem } from "./utils";

const personalCollectionsRoot: OmniPickerCollectionItem = {
  ...PERSONAL_COLLECTIONS,
  can_write: false,
  model: "collection",
  location: "/",
  here: ["collection"],
  below: ["collection"],
};

/**
 * This will generate a list of the top level items for the entity picker
 */
export const useRootItems = () => {
  const { options, models, searchQuery, namespaces } = useOmniPickerContext();
  const isAdmin = useSelector(getUserIsAdmin);
  const hasTenants = useSetting("use-tenants");
  const transformsEnabled = useHasTokenFeature("transforms");
  const dispatch = useDispatch();

  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery(undefined, { skip: !options.hasDatabases });
  const tenantsEnabled = useSetting("use-tenants");

  const currentUser = useSelector(getUser);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [rootItems, setRootItems] = useState<OmniPickerItem[]>([]);

  const { data: personalCollection, isLoading: isLoadingPersonalCollection } =
    useGetPersonalCollection();

  const { data: libraryCollection } =
    PLUGIN_DATA_STUDIO.useGetLibraryCollection({
      skip: !options.hasLibrary,
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

  useDeepCompareEffect(() => {
    const databases = databaseData?.data ?? [];
    setIsLoadingCollections(true);
    getRootItems({
      searchQuery,
      personalCollection,
      isAdmin,
      options,
      databases,
      totalPersonalCollectionItems,
      libraryCollection,
      namespaces,
      models,
      tenantsEnabled,
      transformsEnabled,
      currentUser,
      hasTenants,
      dispatch,
    })
      .then((rootItems) => {
        setRootItems(rootItems);
      })
      .finally(() => {
        setIsLoadingCollections(false);
      });
  }, [
    searchQuery,
    personalCollection,
    isAdmin,
    options,
    databaseData?.data,
    totalPersonalCollectionItems,
    libraryCollection,
    namespaces,
    models,
    tenantsEnabled,
    transformsEnabled,
    currentUser,
    hasTenants,
    setIsLoadingCollections,
    dispatch,
  ]);

  const isLoading =
    isLoadingDatabases ||
    isLoadingCollections ||
    isLoadingPersonalCollection ||
    isLoadingPersonalCollectionItems;

  return { items: rootItems, isLoading };
};

async function getRootItems({
  searchQuery,
  personalCollection,
  isAdmin,
  options,
  databases,
  totalPersonalCollectionItems,
  libraryCollection,
  namespaces,
  models,
  tenantsEnabled,
  transformsEnabled,
  currentUser,
  hasTenants,
  dispatch,
}: {
  searchQuery?: string;
  personalCollection?: Collection;
  isAdmin: boolean;
  options: EntityPickerOptions;
  databases: Database[];
  totalPersonalCollectionItems: number;
  libraryCollection?: OmniPickerItem;
  namespaces: CollectionNamespace[];
  models: OmniPickerItem["model"][];
  tenantsEnabled: boolean;
  transformsEnabled: boolean;
  currentUser: User | null;
  hasTenants: boolean;
  dispatch: DispatchFn;
}): Promise<OmniPickerCollectionItem[]> {
  const collectionItems: OmniPickerCollectionItem[] = [];
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

  if (options.hasLibrary && libraryCollection && namespaces.includes(null)) {
    collectionItems.push({
      ...libraryCollection,
      model: "collection",
      can_write: false,
      location: "/",
      collection: undefined,
    });
  }

  if (options.hasRecents) {
    collectionItems.push({
      id: "recents",
      name: t`Recent items`,
      model: "collection",
      can_write: false,
      location: "/",
      below: validCollectionModels,
      here: validCollectionModels,
    });
  }

  if (options.hasDatabases && databases.length > 0) {
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

  if (namespaces.includes("snippets")) {
    collectionItems.push({
      ...(await getRootCollectionItem({
        namespace: "snippets",
        dispatch,
      })),
      here: ["collection"],
      below: validCollectionModels,
    });
  }

  if (namespaces.includes("transforms") && transformsEnabled) {
    collectionItems.push({
      ...(await getRootCollectionItem({
        namespace: "transforms",
        dispatch,
      })),
      here: ["collection"],
      below: validCollectionModels,
    });
  }

  if (options?.hasRootCollection && namespaces.includes(null)) {
    collectionItems.push({
      ...(await getRootCollectionItem({
        namespace: null,
        dispatch,
      })),
      model: "collection",
      here: ["collection"],
      below: validCollectionModels,
    });
  }

  if (
    hasTenants &&
    namespaces.includes(PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE)
  ) {
    collectionItems.push({
      ...(await getRootCollectionItem({
        namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
        dispatch,
      })),
      here: ["collection", "card", "dashboard"],
      can_write: true, // should check API for this
    });
  }

  if (
    hasTenants &&
    namespaces.includes(PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE)
  ) {
    const userTenantCollectionId = currentUser?.tenant_collection_id;

    if (userTenantCollectionId && tenantsEnabled) {
      // show user's tenant collection
      collectionItems.push({
        name: t`Our data`,
        id: userTenantCollectionId,
        here: ["collection", "card", "dashboard"],
        can_write: true,
        namespace: null,
        model: "collection",
        location: "/",
        type: "tenant-specific-root-collection",
      });
    }
    const tenantSpecificRoot = await getRootCollectionItem({
      namespace: PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE,
      dispatch,
    });
    if (tenantSpecificRoot && isAdmin) {
      // show all tenant collections to admins
      collectionItems.push(tenantSpecificRoot);
    }
  }

  if (
    options?.hasPersonalCollections &&
    namespaces.includes(null) &&
    currentUser &&
    !!personalCollection
  ) {
    collectionItems.push({
      ...personalCollection,
      namespace: null,
      here: totalPersonalCollectionItems ? ["collection"] : [],
      below: totalPersonalCollectionItems ? validCollectionModels : [],
      model: "collection",
      can_write: true,
    });

    if (isAdmin) {
      collectionItems.push({
        ...personalCollectionsRoot,
        model: "collection",
        namespace: null,
        here: ["collection"],
        below: validCollectionModels,
        location: "/",
      });
    }
  }
  return collectionItems;
}
