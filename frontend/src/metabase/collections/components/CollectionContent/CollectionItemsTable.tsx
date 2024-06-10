/* eslint-disable react/prop-types */
import cx from "classnames";
import { useCallback, useEffect, useState } from "react";

import {
  ALL_MODELS,
  COLLECTION_PAGE_SIZE,
} from "metabase/collections/components/CollectionContent/constants";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import { isRootTrashCollection } from "metabase/collections/utils";
import { ItemsTable } from "metabase/components/ItemsTable";
import { PaginationControls } from "metabase/components/PaginationControls";
import CS from "metabase/css/core/index.css";
import Search from "metabase/entities/search";
import { usePagination } from "metabase/hooks/use-pagination";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import {
  CollectionEmptyContent,
  CollectionTable,
} from "./CollectionContent.styled";

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
  showActionMenu: boolean;
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
  pageSize = COLLECTION_PAGE_SIZE,
  models = ALL_MODELS,
  onClick,
  showActionMenu = true,
}: CollectionItemsTableProps) => {
  const [unpinnedItemsSorting, setUnpinnedItemsSorting] =
    useState<SortingOptions>({
      sort_column: "name",
      sort_direction: SortDirection.Asc,
    });

  const [total, setTotal] = useState<number | null>(null);

  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();

  useEffect(() => {
    if (collectionId) {
      resetPage();
      setTotal(null);
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

  return (
    <Search.ListLoader
      query={unpinnedQuery}
      loadingAndErrorWrapper={false}
      keepListWhileLoading
      wrapped
    >
      {({
        list: unpinnedItems = [],
        metadata = {},
        loading: loadingUnpinnedItems,
      }: {
        list: CollectionItem[];
        metadata: { total?: number };
        loading: boolean;
      }) => {
        if (metadata.total) {
          setTotal(metadata.total);
        }

        const hasPagination: boolean = total ? total > pageSize : false;

        const unselected = getIsSelected
          ? unpinnedItems.filter(item => !getIsSelected(item))
          : unpinnedItems;
        const hasUnselected = unselected.length > 0;

        const handleSelectAll = () => {
          selectOnlyTheseItems?.(unpinnedItems);
        };

        const loading = loadingPinnedItems || loadingUnpinnedItems;
        const isEmpty =
          !loading && !hasPinnedItems && unpinnedItems.length === 0;

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
              items={unpinnedItems}
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
              onClick={
                onClick ? (item: CollectionItem) => onClick(item) : undefined
              }
              showActionMenu={showActionMenu}
            />
            <div className={cx(CS.flex, CS.justifyEnd, CS.my3)}>
              {hasPagination && (
                <PaginationControls
                  showTotal
                  page={page}
                  pageSize={pageSize}
                  total={total ?? undefined}
                  itemsLength={unpinnedItems.length}
                  onNextPage={handleNextPage}
                  onPreviousPage={handlePreviousPage}
                />
              )}
            </div>
          </CollectionTable>
        );
      }}
    </Search.ListLoader>
  );
};
