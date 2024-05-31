import cx from "classnames";

import { useSearchQuery } from "metabase/api";
import { CollectionBulkActions } from "metabase/collections/components/CollectionBulkActions";
import {
  CollectionEmptyContent,
  CollectionTable,
} from "metabase/collections/components/CollectionContent/CollectionContent.styled";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import { ItemsTable } from "metabase/components/ItemsTable";
import type { SortingOptions } from "metabase/components/ItemsTable/BaseItemsTable";
import PaginationControls from "metabase/components/PaginationControls";
import CS from "metabase/css/core/index.css";
import Search from "metabase/entities/search";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  SearchRequest,
} from "metabase-types/api";

export const CollectionUnpinnedItems = ({
  unpinnedQuery,
  getIsSelected,
  selectOnlyTheseItems,
  loadingPinnedItems,
  hasPinnedItems,
  collection,
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  unpinnedItemsSorting,
  handleUnpinnedItemsSortingChange,
  selected,
  toggleItem,
  clear,
  handleMove,
  handleCopy,
  page,
  handleNextPage,
  handlePreviousPage,
  selectedItems,
  setSelectedItems,
  selectedAction,
  setSelectedAction,
}: {
  unpinnedQuery: SearchRequest;
  getIsSelected: (item: CollectionItem) => boolean;
  selectOnlyTheseItems: (items: CollectionItem[]) => void;
  loadingPinnedItems: boolean;
  hasPinnedItems: boolean;
  collection: Collection;
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark: CreateBookmark;
  deleteBookmark: DeleteBookmark;
  unpinnedItemsSorting: SortingOptions;
  handleUnpinnedItemsSortingChange: (sortingOpts: SortingOptions) => void;
  selected: CollectionItem[];
  toggleItem: (item: CollectionItem) => void;
  clear: () => void;
  handleMove: (selectedItems: CollectionItem[]) => void;
  handleCopy: (selectedItems: CollectionItem[]) => void;
  page: number;
  handleNextPage: () => void;
  handlePreviousPage: () => void;
  selectedItems: CollectionItem[] | null;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  selectedAction: string | null;
  setSelectedAction: (action: string | null) => void;
}) => {
  const {
    status,
    endpointName,
    requestId,
    originalArgs,
    startedTimeStamp,
    data,
    fulfilledTimeStamp,
    isUninitialized,
    isLoading,
    isSuccess,
    isError,
    currentData,
    isFetching,
    refetch,
  } = useSearchQuery(unpinnedQuery);

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
        metadata: {
          total?: number;
        };
        loading: boolean;
      }) => {
        const hasPagination: boolean =
          !!metadata.total && metadata.total > PAGE_SIZE;
        const unselected = unpinnedItems.filter(item => !getIsSelected(item));
        const hasUnselected = unselected.length > 0;

        const handleSelectAll = () => {
          selectOnlyTheseItems(unpinnedItems);
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
          <>
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
              />
              <div className={cx(CS.flex, CS.justifyEnd, CS.my3)}>
                {hasPagination && (
                  <PaginationControls
                    showTotal
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={metadata.total}
                    itemsLength={unpinnedItems.length}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                  />
                )}
              </div>
            </CollectionTable>
            <CollectionBulkActions
              collection={collection}
              selected={selected}
              clearSelected={clear}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              selectedAction={selectedAction}
              setSelectedAction={setSelectedAction}
            />
          </>
        );
      }}
    </Search.ListLoader>
  );
};
