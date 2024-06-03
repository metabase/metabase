import cx from "classnames";
import type { JSX } from "react";

import { useListCollectionItemsQuery } from "metabase/api";
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
import type {
  SortingOptions,
  ItemRendererProps,
} from "metabase/components/ItemsTable/BaseItemsTable";
import PaginationControls from "metabase/components/PaginationControls";
import CS from "metabase/css/core/index.css";
import { PAGE_SIZE } from "metabase/search/containers/constants";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  ListCollectionItemsRequest,
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
  ItemComponent,
  includeActions = true,
}: {
  unpinnedQuery: ListCollectionItemsRequest;
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
  ItemComponent?: (props: ItemRendererProps) => JSX.Element;
  includeActions?: boolean;
}) => {
  const { data, isLoading } = useListCollectionItemsQuery(unpinnedQuery);

  if (!data) {
    return null;
  }

  const total = data.total;
  const unpinnedItems = data.data || [];

  const hasPagination: boolean = total ? total > PAGE_SIZE : false;
  const unselected = unpinnedItems.filter(item => !getIsSelected(item));
  const hasUnselected = unselected.length > 0;

  const handleSelectAll = () => {
    selectOnlyTheseItems(unpinnedItems);
  };

  const loading = loadingPinnedItems || isLoading;
  const isEmpty = !loading && !hasPinnedItems && unpinnedItems.length === 0;

  if (isEmpty && !isLoading) {
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
          ItemComponent={ItemComponent}
          includeActions={includeActions}
        />
        <div className={cx(CS.flex, CS.justifyEnd, CS.my3)}>
          {hasPagination && (
            <PaginationControls
              showTotal
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
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
};
