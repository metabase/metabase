import cx from "classnames";
import { useCallback, useEffect, useState } from "react";

import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import { isRootTrashCollection } from "metabase/collections/utils";
import { useSearchListQuery } from "metabase/common/hooks";
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
} from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";
import type { Dispatch } from "metabase-types/store";

import {
  CollectionEmptyContent,
  CollectionTable,
} from "./CollectionContent.styled";

const PAGE_SIZE = 25;
const ALL_MODELS: CollectionItemModel[] = [
  "dashboard",
  "dataset",
  "card",
  "metric",
  "snippet",
  "collection",
];

const wrapCollectionItemList = (
  itemList: CollectionItem[],
  dispatch: Dispatch,
) => {
  return (itemList ?? []).map(object => {
    const entity = entityForObject(object);
    if (entity) {
      return entity.wrapEntity(object, dispatch);
    } else {
      console.warn("Couldn't find entity for object", object);
      return object;
    }
  });
};

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
  onClick: (item: CollectionItem) => void;
}>;

export const CollectionItemsTable = ({
  collectionId,
  collection,
  getIsSelected,
  selectOnlyTheseItems,
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  loadingPinnedItems,
  hasPinnedItems,
  selected,
  toggleItem,
  clear,
  handleMove,
  handleCopy,
  pageSize = PAGE_SIZE,
  models = ALL_MODELS,
  onClick,
}: CollectionItemsTableProps) => {
  const [unpinnedItemsSorting, setUnpinnedItemsSorting] =
    useState<SortingOptions>({
      sort_column: "name",
      sort_direction: SortDirection.Asc,
    });

  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();

  useEffect(() => {
    if (collectionId) {
      resetPage();
    }
  }, [collectionId, resetPage]);

  const handleUnpinnedItemsSortingChange = useCallback(
    (sortingOpts: SortingOptions) => {
      setUnpinnedItemsSorting(sortingOpts);
      setPage(0);
    },
    [setPage],
  );

  const showAllItems = !collection || isRootTrashCollection(collection);

  const unpinnedQuery = {
    collection: collectionId,
    models,
    limit: pageSize,
    offset: pageSize * page,
    ...(showAllItems ? {} : { pinned_state: "is_not_pinned" }),
    ...unpinnedItemsSorting,
  };

  const {
    data = [],
    isLoading: loadingUnpinnedItems,
    metadata,
  } = useSearchListQuery({
    // @ts-expect-error SearchRequest[models] is SearchModel[] but we use CollectionItem[] for this query
    query: unpinnedQuery,
  });

  const dispatch = useDispatch();

  const collectionItemList = wrapCollectionItemList(data, dispatch);

  const total = metadata?.total ?? 0;
  const hasPagination = total > PAGE_SIZE;

  const unselected = getIsSelected
    ? collectionItemList.filter(item => !getIsSelected(item))
    : collectionItemList;
  const hasUnselected = unselected.length > 0;

  const handleSelectAll = () => {
    selectOnlyTheseItems?.(collectionItemList);
  };

  const loading = loadingPinnedItems || loadingUnpinnedItems;
  const isEmpty =
    !loading && !hasPinnedItems && collectionItemList.length === 0;

  if (isEmpty && !loadingUnpinnedItems) {
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
        items={collectionItemList}
        collection={collection}
        sortingOptions={unpinnedItemsSorting}
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
        onClick={onClick ? (item: CollectionItem) => onClick(item) : undefined}
        isLoading={!hasPinnedItems && loadingUnpinnedItems}
      />
      <div className={cx(CS.flex, CS.justifyEnd, CS.my3)}>
        {hasPagination && (
          <PaginationControls
            showTotal
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            itemsLength={collectionItemList.length}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
          />
        )}
      </div>
    </CollectionTable>
  );
};
