import { useCallback, useState } from "react";

import {
  SdkError,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { CollectionUnpinnedItems } from "metabase/collections/components/CollectionContent/CollectionUnpinnedItems";
import { PAGE_SIZE } from "metabase/collections/components/CollectionContent/constants";
import {
  useBookmarkListQuery,
  useCollectionQuery,
  useDatabaseListQuery,
} from "metabase/common/hooks";
import type { SortingOptions } from "metabase/components/ItemsTable/BaseItemsTable";
import { SdkItemRenderer } from "metabase/components/ItemsTable/BaseItemsTable";
import { SortDirection } from "metabase/components/ItemsTable/Columns";
import { useListSelect } from "metabase/hooks/use-list-select";
import { usePagination } from "metabase/hooks/use-pagination";
import type {
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  ListCollectionItemsRequest,
} from "metabase-types/api";

const itemKeyFn = (item: CollectionItem) => `${item.id}:${item.model}`;

const ALL_MODELS: CollectionItemModel[] = [
  "dashboard",
  "dataset",
  "card",
  "metric",
  "collection",
];

export const CollectionBrowser = withPublicComponentWrapper(
  ({
    collectionId,
    setSelectedItem,
  }: {
    collectionId: CollectionId;
    setSelectedItem: any;
  }) => {
    const { data: bookmarks, error: bookmarksError } = useBookmarkListQuery();
    const { data: databases, error: databasesError } = useDatabaseListQuery();
    const { data: collection, error: collectionError } = useCollectionQuery({
      id: collectionId,
    });

    const { handleNextPage, handlePreviousPage, setPage, page } =
      usePagination();

    const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
      useListSelect(itemKeyFn);

    const [unpinnedItemsSorting, setUnpinnedItemsSorting] =
      useState<SortingOptions>({
        sort_column: "name",
        sort_direction: SortDirection.Asc,
      });

    const handleUnpinnedItemsSortingChange = useCallback(
      (sortingOpts: SortingOptions) => {
        setUnpinnedItemsSorting(sortingOpts);
        setPage(0);
      },
      [setPage],
    );

    if (!collection) {
      return null;
    }

    const unpinnedQuery: ListCollectionItemsRequest = {
      id: collectionId,
      // TODO: do we need snippets and pulses?
      models: ALL_MODELS as CollectionItemModel[],
      limit: PAGE_SIZE,
      offset: PAGE_SIZE * page,
      ...unpinnedItemsSorting,
    };

    if (collectionError || databasesError || bookmarksError) {
      return (
        <SdkError
          message={`Could not load collection: ${String(
            collectionError || databasesError || bookmarksError,
          )}`}
        />
      );
    }

    return (
      <CollectionUnpinnedItems
        hasPinnedItems={false}
        selectedItems={null}
        setSelectedItems={() => {}}
        selectedAction={null}
        setSelectedAction={() => {}}
        unpinnedItemsSorting={unpinnedItemsSorting}
        handleNextPage={handleNextPage}
        handlePreviousPage={handlePreviousPage}
        page={page}
        clear={clear}
        getIsSelected={getIsSelected}
        selected={selected}
        selectOnlyTheseItems={selectOnlyTheseItems}
        toggleItem={toggleItem}
        handleUnpinnedItemsSortingChange={handleUnpinnedItemsSortingChange}
        handleMove={() => {}}
        handleCopy={() => {}}
        unpinnedQuery={unpinnedQuery}
        loadingPinnedItems={false}
        databases={databases}
        bookmarks={bookmarks}
        collection={collection}
        createBookmark={() => {}}
        deleteBookmark={() => {}}
        ItemComponent={props => (
          <SdkItemRenderer
            onClickItem={item => setSelectedItem(item)}
            {...props}
          />
        )}
        includeActions={false}
      />
    );
  },
);
