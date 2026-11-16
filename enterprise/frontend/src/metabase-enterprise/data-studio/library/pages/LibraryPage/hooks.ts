import { useMemo } from "react";
import { t } from "ttag";

import type { TreeItem } from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { useSelector } from "metabase/redux";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { CollectionId, IconName } from "metabase-types/api";

import {
  type SemanticLayerItemModel,
  useCollectionItemsTree,
} from "../../hooks/use-collection-items-tree";
import {
  type LibrarySearchModel,
  useLibrarySearchResults,
} from "../../hooks/use-library-search-results";

type SemanticLayerSection = {
  id: string;
  name: string;
  icon: IconName;
  itemModel: SemanticLayerItemModel;
};

export type SemanticLayerSectionType = "data" | "metrics";

const getSemanticLayerSections = (): Record<
  SemanticLayerSectionType,
  SemanticLayerSection
> => ({
  data: {
    id: "section:data",
    name: t`Data`,
    icon: "table",
    itemModel: "table",
  },
  metrics: {
    id: "section:metrics",
    name: t`Metrics`,
    icon: "metric",
    itemModel: "metric",
  },
});

export const getSemanticLayerSectionId = (
  sectionType: SemanticLayerSectionType,
) => getSemanticLayerSections()[sectionType].id;

export const getSemanticLayerCollectionRowId = (
  sectionType: SemanticLayerSectionType,
  collectionId: CollectionId | string,
) => `${sectionType}:collection:${collectionId}`;

/**
 * A Semantic layer section: a root row holding every collection of the main and
 * shared tenant namespaces with the section's items in it, or the section's
 * empty-state row when there are none.
 */
export function useSemanticLayerSectionTree(
  sectionType: SemanticLayerSectionType,
  metricCollectionId?: CollectionId,
) {
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { id, name, icon, itemModel } = getSemanticLayerSections()[sectionType];
  const { items, isLoading, error, watchRows, isChildrenLoading } =
    useCollectionItemsTree(itemModel, `${sectionType}:`);

  const tree = useMemo((): TreeItem[] => {
    if (!items) {
      return [];
    }

    return [
      {
        id,
        name,
        icon,
        model: "collection",
        data: { model: "collection", name },
        children:
          items.length > 0
            ? items
            : [
                createEmptyStateItem(
                  sectionType,
                  metricCollectionId,
                  isRemoteSyncReadOnly,
                ),
              ],
      },
    ];
  }, [
    items,
    id,
    name,
    icon,
    sectionType,
    metricCollectionId,
    isRemoteSyncReadOnly,
  ]);

  return {
    tree,
    isLoading,
    error,
    watchRows,
    isChildrenLoading,
  };
}

type SearchSection = {
  id: string;
  name: string;
  icon: IconName;
};

const getSearchSections = (): Record<LibrarySearchModel, SearchSection> => ({
  table: { id: "search-section:data", name: t`Data`, icon: "table" },
  metric: { id: "search-section:metrics", name: t`Metrics`, icon: "metric" },
});

/** Search results across every collection, grouped under a row per section */
export function useLibrarySearch(
  searchQuery: string,
  models: LibrarySearchModel[],
) {
  const { items, isActive, isLoading, error } = useLibrarySearchResults(
    searchQuery,
    models,
  );

  const tree = useMemo((): TreeItem[] => {
    const sections = getSearchSections();
    return models.flatMap((model): TreeItem[] => {
      const children = items.filter((item) => item.model === model);
      if (children.length === 0) {
        return [];
      }
      const { id, name, icon } = sections[model];
      return [
        {
          id,
          name,
          icon,
          model: "collection",
          data: { model: "collection", name },
          children,
        },
      ];
    });
  }, [items, models]);

  return { tree, isActive, isLoading, error };
}
