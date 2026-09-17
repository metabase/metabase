import { useMemo } from "react";

import { skipToken, useSearchQuery } from "metabase/api";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import { isLibraryCollection } from "metabase/common/collections/utils";
import type { IconData } from "metabase/common/utils/icon";
import { useGetIcon } from "metabase/hooks/use-icon";
import * as Urls from "metabase/urls";
import type {
  CollectionId,
  SearchModel,
  SearchResultId,
} from "metabase-types/api";

export type OfficialNavItem = {
  id: SearchResultId;
  model: SearchModel;
  name: string;
  url: string;
  icon: IconData;
  collectionId: CollectionId;
};

/**
 * A nav rail is not a browse page: it lists what is curated, not everything findable. Both queries
 * are capped rather than paginated.
 */
const ITEM_LIMIT = 200;

const LIBRARY_MODELS: SearchModel[] = [
  "table",
  "metric",
  "dataset",
  "measure",
  "card",
  "dashboard",
  "document",
];

/**
 * `table` is deliberately absent: an unscoped table search returns every warehouse table, and a
 * table is only official by way of the Library, which the library query already covers.
 */
const OFFICIAL_MODELS: SearchModel[] = [
  "dataset",
  "metric",
  "card",
  "dashboard",
  "document",
];

type UseOfficialNavItems = {
  itemsByCollectionId: Map<CollectionId, OfficialNavItem[]>;
  officialCollectionIds: CollectionId[];
  isLoading: boolean;
};

export function useOfficialNavItems(
  collections: CollectionTreeItem[],
): UseOfficialNavItems {
  const getIcon = useGetIcon();

  // The search API treats `collection` as a hierarchy, so scoping to the Library root covers
  // library-data, library-metrics and all their descendants.
  const libraryCollectionId = collections.find(isLibraryCollection)?.id;

  const { data: libraryResults, isLoading: isLoadingLibrary } = useSearchQuery(
    libraryCollectionId == null
      ? skipToken
      : {
          context: "library",
          collection: libraryCollectionId,
          models: LIBRARY_MODELS,
          filter_items_in_personal_collection: "exclude",
          model_ancestors: false,
          limit: ITEM_LIMIT,
        },
  );

  // There is no authority-level search parameter at any layer, so official items are filtered
  // client-side.
  const { data: officialResults, isLoading: isLoadingOfficial } =
    useSearchQuery({
      context: "browse",
      models: OFFICIAL_MODELS,
      filter_items_in_personal_collection: "exclude",
      model_ancestors: false,
      limit: ITEM_LIMIT,
    });

  const itemsByCollectionId = useMemo(() => {
    const results = [
      ...(libraryResults?.data ?? []),
      ...(officialResults?.data ?? []).filter(
        (result) => result.collection_authority_level === "official",
      ),
    ];

    const byCollection = new Map<CollectionId, OfficialNavItem[]>();
    const seen = new Set<string>();

    for (const result of results) {
      const collectionId = result.collection?.id;

      if (collectionId == null) {
        continue;
      }

      const key = `${result.model}-${result.id}`;

      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const items = byCollection.get(collectionId) ?? [];
      items.push({
        id: result.id,
        model: result.model,
        name: result.name,
        url: Urls.modelToUrl(result),
        icon: getIcon(result),
        collectionId,
      });
      byCollection.set(collectionId, items);
    }

    for (const items of byCollection.values()) {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return byCollection;
  }, [libraryResults, officialResults, getIcon]);

  const officialCollectionIds = useMemo(
    () => getTopMostOfficialCollectionIds(collections),
    [collections],
  );

  return {
    itemsByCollectionId,
    officialCollectionIds,
    isLoading: isLoadingLibrary || isLoadingOfficial,
  };
}

/**
 * Only the top-most official ancestor is kept, so an official collection nested inside another
 * official one is not rendered twice.
 */
function getTopMostOfficialCollectionIds(
  collections: CollectionTreeItem[],
): CollectionId[] {
  const ids: CollectionId[] = [];

  const walk = (nodes: CollectionTreeItem[]) => {
    for (const node of nodes) {
      if (node.authority_level === "official") {
        ids.push(node.id);
      } else {
        walk(node.children ?? []);
      }
    }
  };

  walk(collections.filter((collection) => !isLibraryCollection(collection)));

  return ids;
}
