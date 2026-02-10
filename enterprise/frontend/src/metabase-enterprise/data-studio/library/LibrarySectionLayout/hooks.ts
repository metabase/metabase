import { useEffect, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
import { getIcon } from "metabase/lib/icon";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { Collection, CollectionId } from "metabase-types/api";

export const useBuildTreeForCollection = (
  collection: Collection | undefined,
  sectionType: LibrarySectionType,
  metricCollectionId?: CollectionId,
): {
  isLoading: boolean;
  tree: TreeItem[];
  error?: unknown;
} => {
  const {
    data: items,
    isLoading,
    error,
  } = useListCollectionItemsQuery(
    collection ? { id: collection.id, models: ["metric", "table"] } : skipToken,
  );

  return useMemo(() => {
    if (isLoading || !items || !collection) {
      return {
        isLoading,
        tree: [],
        error,
      };
    }

    const hasItems = items.data.length > 0;
    const children: TreeItem[] = hasItems
      ? items.data.map((item) => ({
          name: item.name,
          updatedAt: item["last-edit-info"]?.timestamp,
          icon: getIcon({ model: item.model }).name,
          data: item,
          id: `${item.model}:${item.id}`,
          model: item.model,
        }))
      : [createEmptyStateItem(sectionType, metricCollectionId)];

    return {
      isLoading,
      error,
      tree: [
        {
          name: collection.name,
          id: `collection:${collection.id}`,
          icon: getIcon({ ...collection, model: "collection" }).name,
          data: { ...collection, model: "collection" },
          model: "collection",
          children,
        },
      ],
    };
  }, [isLoading, items, collection, error, sectionType, metricCollectionId]);
};

export const useErrorHandling = (_error: unknown) => {
  const error = useDebouncedValue(_error, 1000);
  const { sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    if (_.isObject(error) && typeof error?.data?.message === "string") {
      sendErrorToast(
        t`Data couldn't be fetched properly: ${error.data.message}`,
      );
    }
  }, [error, sendErrorToast]);
};
