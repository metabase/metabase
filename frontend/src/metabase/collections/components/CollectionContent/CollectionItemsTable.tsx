import cx from "classnames";
import { useCallback, useEffect, useState } from "react";

import { useListCollectionItemsQuery } from "metabase/api";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import { isRootTrashCollection } from "metabase/collections/utils";
import { ItemsTable } from "metabase/components/ItemsTable";
import { PaginationControls } from "metabase/components/PaginationControls";
import CS from "metabase/css/core/index.css";
import { usePagination } from "metabase/hooks/use-pagination";
import { useDispatch } from "metabase/lib/redux";
import { entityForObject } from "metabase/lib/schema";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  ListCollectionItemsRequest,
} from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import {
  CollectionEmptyContent,
  CollectionTable,
} from "./CollectionContent.styled";

const PAGE_SIZE = 3;
const ALL_MODELS: CollectionItemModel[] = [
  "dashboard",
  "dataset",
  "card",
  "metric",
  "snippet",
  "collection",
];

export type CollectionItemsTableProps = {
  collectionId: CollectionId;
} & Partial<{
  bookmarks: Bookmark[];
  clear: () => void;
  collection: Collection;
  createBookmark: CreateBookmark;
  databases: Database[];
  deleteBookmark: DeleteBookmark;
  getIsSelected: (item: CollectionItem) => boolean;
  handleCopy: (items: CollectionItem[]) => void;
  handleMove: (items: CollectionItem[]) => void;
  hasPinnedItems: boolean;
  loadingPinnedItems: boolean;
  models: CollectionItemModel[];
  pageSize: number;
  selectOnlyTheseItems: (items: CollectionItem[]) => void;
  selected: CollectionItem[];
  toggleItem: (item: CollectionItem) => void;
}>;

export const CollectionItemsTable = ({
  collectionId,
  bookmarks,
  clear,
  collection,
  createBookmark,
  databases,
  deleteBookmark,
  getIsSelected,
  handleCopy,
  handleMove,
  hasPinnedItems,
  loadingPinnedItems,
  models = ALL_MODELS,
  pageSize = PAGE_SIZE,
  selectOnlyTheseItems,
  selected,
  toggleItem,
}: CollectionItemsTableProps) => {
  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();

  useEffect(() => {
    if (collectionId) {
      resetPage();
    }
  }, [collectionId, resetPage]);

  const [itemsSorting, setItemsSorting] = useState<SortingOptions>({
    sort_column: "name",
    sort_direction: SortDirection.Asc,
  });

  const handleUnpinnedItemsSortingChange = useCallback(
    (sortingOpts: SortingOptions) => {
      setItemsSorting(sortingOpts);
      setPage(0);
    },
    [setPage],
  );

  const query: ListCollectionItemsRequest = {
    id: collectionId,
    models,
    limit: pageSize,
    offset: pageSize * page,
    ...(isRootTrashCollection(collection)
      ? {}
      : { pinned_state: "is_not_pinned" }),
    ...itemsSorting,
  };

  const { data, isLoading } = useListCollectionItemsQuery(query);

  const dispatch = useDispatch();

  const items = (data?.data ?? []).map(object => {
    const entity = entityForObject(object);
    if (entity) {
      return entity.wrapEntity(object, dispatch);
    } else {
      console.warn("Couldn't find entity for object", object);
      return object;
    }
  });
  const total = data?.total || 0;
  const hasPagination: boolean = total > PAGE_SIZE;
  const unselected = getIsSelected
    ? items.filter(item => !getIsSelected(item))
    : items;
  const hasUnselected = unselected.length > 0;

  const handleSelectAll = () => {
    selectOnlyTheseItems?.(items);
  };

  const loading = loadingPinnedItems || isLoading;
  const isEmpty = !loading && !hasPinnedItems && items.length === 0;

  if (isEmpty && !isLoading) {
    return (
      <CollectionEmptyContent>
        <CollectionEmptyState collection={collection} />
      </CollectionEmptyContent>
    );
  }

  return (
    <CollectionTable data-testid="collection-table">
      <ItemsTable
        databases={databases}
        bookmarks={bookmarks}
        createBookmark={createBookmark}
        deleteBookmark={deleteBookmark}
        items={items}
        collection={collection}
        sortingOptions={itemsSorting}
        onSortingOptionsChange={handleUnpinnedItemsSortingChange}
        selectedItems={selected}
        hasUnselected={hasUnselected}
        getIsSelected={getIsSelected}
        onToggleSelected={toggleItem}
        onDrop={clear}
        onMove={handleMove}
        onCopy={handleCopy}
        onSelectAll={handleSelectAll}
        onSelectNone={clear}
      />
      <div className={cx(CS.flex, CS.justifyEnd, CS.my3)}>
        {hasPagination && (
          <PaginationControls
            showTotal
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            itemsLength={items.length}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
          />
        )}
      </div>
    </CollectionTable>
  );
};
