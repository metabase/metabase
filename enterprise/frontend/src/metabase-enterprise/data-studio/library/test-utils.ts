import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { Collection } from "metabase-types/api";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";

export const LIBRARY_COLLECTION = createMockCollection({
  id: 901,
  name: "Library",
  type: "library",
});

export const DASHBOARDS_COLLECTION = createMockCollection({
  id: 902,
  name: "Dashboards",
  type: "library-dashboards",
  location: `/${LIBRARY_COLLECTION.id}/`,
  effective_ancestors: [LIBRARY_COLLECTION],
});

export const DOCUMENTS_COLLECTION = createMockCollection({
  id: 903,
  name: "Documents",
  type: "library-documents",
  location: `/${LIBRARY_COLLECTION.id}/`,
  effective_ancestors: [LIBRARY_COLLECTION],
});

export const METRICS_COLLECTION = createMockCollection({
  id: 904,
  name: "Metrics",
  type: "library-metrics",
  location: `/${LIBRARY_COLLECTION.id}/`,
  effective_ancestors: [LIBRARY_COLLECTION],
});

export const TRASH_COLLECTION = createMockCollection({
  id: 905,
  name: "Trash",
  type: "trash",
});

/** A folder inside a Library section, with its location and ancestors filled in */
function createLibraryFolder(
  section: Collection,
  opts: Pick<Collection, "id" | "name"> & Partial<Collection>,
): Collection {
  return createMockCollection({
    type: section.type,
    location: `${section.location}${section.id}/`,
    effective_ancestors: [...(section.effective_ancestors ?? []), section],
    ...opts,
  });
}

export const DASHBOARDS_FOLDER = createLibraryFolder(DASHBOARDS_COLLECTION, {
  id: 908,
  name: "Sales",
});

export const DOCUMENTS_FOLDER = createLibraryFolder(DOCUMENTS_COLLECTION, {
  id: 906,
  name: "Sales",
});

/** Trashed directly, so the API presents the Trash as its ancestors */
export const TRASHED_FOLDER = createLibraryFolder(DOCUMENTS_COLLECTION, {
  id: 907,
  name: "Old reports",
  archived: true,
  archived_directly: true,
  effective_ancestors: [TRASH_COLLECTION],
});

/** A collection outside the Library */
export const SHARED_COLLECTION = createMockCollection({
  id: 909,
  name: "Shared",
});

export const ORDERS_QUESTION = createMockCard({
  id: 1,
  name: "Orders",
  type: "question",
  collection_id: SHARED_COLLECTION.id,
});

export const REVENUE_METRIC = createMockCard({
  id: 2,
  name: "Revenue",
  type: "metric",
  collection_id: SHARED_COLLECTION.id,
});

export const LIBRARY_METRIC = createMockCard({
  id: 4,
  name: "Churn rate",
  type: "metric",
  collection_id: METRICS_COLLECTION.id,
});

/** Serves the root collection, the Library, its sections, and `collections` by id */
export function setupLibraryCollectionEndpoints(
  collections: Collection[] = [],
) {
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection(ROOT_COLLECTION),
      LIBRARY_COLLECTION,
      DASHBOARDS_COLLECTION,
      DOCUMENTS_COLLECTION,
      METRICS_COLLECTION,
      ...collections,
    ],
  });
}
