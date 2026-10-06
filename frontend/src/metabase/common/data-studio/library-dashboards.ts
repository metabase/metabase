/**
 * PROTOTYPE: dashboards in the Library.
 *
 * The backend only allows the Data and Metrics collections inside the Library
 * collection, so the "Library › Dashboards" folder is backed by a regular,
 * top-level collection that the frontend presents as if it lived in the
 * Library. It is identified by a sentinel description.
 */
import { t } from "ttag";

import {
  collectionApi,
  skipToken,
  useCreateCollectionMutation,
  useListCollectionItemsQuery,
} from "metabase/api";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { DispatchFn } from "metabase/redux";
import { useSelector } from "metabase/redux";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

import {
  LIBRARY_DASHBOARDS_DESCRIPTION,
  LIBRARY_DASHBOARDS_TYPE,
  isLibraryDashboardsCollection,
} from "./library-dashboards-utils";
import { canAccessDataStudio } from "./selectors";

export {
  LIBRARY_DASHBOARDS_DESCRIPTION,
  LIBRARY_DASHBOARDS_TYPE,
  isLibraryDashboardsCollection,
} from "./library-dashboards-utils";

const ROOT_COLLECTION_ITEMS_REQUEST = {
  id: "root" as const,
  models: ["collection" as const],
};

/** Whether the collection is the library dashboards root or one of its descendants. */
export function isInLibraryDashboards(
  collection:
    | Pick<Collection, "id" | "location" | "effective_location">
    | null
    | undefined,
  libraryDashboardsId: CollectionId | null | undefined,
): boolean {
  if (collection == null || libraryDashboardsId == null) {
    return false;
  }
  if (collection.id === libraryDashboardsId) {
    return true;
  }
  const location = collection.location ?? collection.effective_location ?? "";
  return location.startsWith(`/${libraryDashboardsId}/`);
}

export function useLibraryDashboardsCollection({
  skip = false,
}: { skip?: boolean } = {}) {
  const { data, isLoading } = useListCollectionItemsQuery(
    !skip && PLUGIN_LIBRARY.isEnabled
      ? ROOT_COLLECTION_ITEMS_REQUEST
      : skipToken,
  );
  return {
    data: data?.data.find(isLibraryDashboardsCollection),
    isLoading,
  };
}

export function useIsInLibraryDashboards(
  collection:
    | Pick<Collection, "id" | "location" | "effective_location">
    | null
    | undefined,
  { skip = false }: { skip?: boolean } = {},
) {
  const { data: libraryDashboardsCollection } = useLibraryDashboardsCollection({
    skip: skip || collection == null,
  });
  return isInLibraryDashboards(collection, libraryDashboardsCollection?.id);
}

export async function fetchLibraryDashboardsCollection(
  dispatch: DispatchFn,
): Promise<CollectionItem | undefined> {
  if (!PLUGIN_LIBRARY.isEnabled) {
    return undefined;
  }
  const response = await dispatch(
    collectionApi.endpoints.listCollectionItems.initiate(
      ROOT_COLLECTION_ITEMS_REQUEST,
    ),
  )
    .unwrap()
    .catch(() => undefined);
  return response?.data.find(isLibraryDashboardsCollection);
}

/** Admins and Data Analysts can save dashboards into the Library. */
export function useCanUseLibraryDashboards() {
  const canAccess = useSelector(canAccessDataStudio);
  return PLUGIN_LIBRARY.isEnabled && canAccess;
}

export function useCreateLibraryDashboardsCollection() {
  const [createCollection, { isLoading }] = useCreateCollectionMutation();
  const create = () =>
    createCollection({
      name: t`Dashboards`,
      description: LIBRARY_DASHBOARDS_DESCRIPTION,
      parent_id: null,
    }).unwrap();
  return [create, { isLoading }] as const;
}

const LIBRARY_DASHBOARDS_MODELS: CollectionItemModel[] = [
  "collection",
  "dashboard",
];

/**
 * The picker item that represents the Library › Dashboards folder. It is a
 * real collection, tagged with a synthetic type so the pickers can treat it
 * as a Library section.
 */
export function getLibraryDashboardsPickerItem(
  collection: Pick<CollectionItem, "id" | "can_write"> &
    Partial<Pick<CollectionItem, "here" | "below">>,
) {
  return {
    id: collection.id,
    name: t`Dashboards`,
    model: "collection" as const,
    type: LIBRARY_DASHBOARDS_TYPE,
    is_library_root: true,
    can_write: collection.can_write,
    location: "/",
    namespace: null,
    here: Array.from(
      new Set([...LIBRARY_DASHBOARDS_MODELS, ...(collection.here ?? [])]),
    ),
    below: Array.from(
      new Set([...LIBRARY_DASHBOARDS_MODELS, ...(collection.below ?? [])]),
    ),
  };
}
