import cx from "classnames";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ALL_MODELS,
  COLLECTION_PAGE_SIZE,
  type CollectionContentTableColumn,
  DEFAULT_VISIBLE_COLUMNS_LIST,
} from "metabase/collections/components/CollectionContent/constants";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/collections/types";
import { isRootTrashCollection } from "metabase/collections/utils";
import { ItemsTable } from "metabase/components/ItemsTable";
import { getVisibleColumnsMap } from "metabase/components/ItemsTable/utils";
import { PaginationControls } from "metabase/components/PaginationControls";
import CS from "metabase/css/core/index.css";
import Search from "metabase/entities/search";
import { usePagination } from "metabase/hooks/use-pagination";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
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
import type { State } from "metabase-types/store";

import {
  CollectionEmptyContent,
  CollectionTable,
} from "./CollectionContent.styled";

const getDefaultSortingOptions = (
  collection: Collection | undefined,
): SortingOptions => {
  return isRootTrashCollection(collection)
    ? {
        sort_column: "last_edited_at",
        sort_direction: SortDirection.Desc,
      }
    : {
        sort_column: "name",
        sort_direction: SortDirection.Asc,
      };
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
  EmptyContentComponent?: ComponentType<{
    collection?: Collection;
  }>;
  getIsSelected: (item: CollectionItem) => boolean;
  handleCopy: (items: CollectionItem[]) => void;
  handleMove: (items: CollectionItem[]) => void;
  hasPinnedItems: boolean;
  loadingPinnedItems: boolean;
  models: CollectionItemModel[];
  pageSize: number;
  selected: CollectionItem[];
  selectOnlyTheseItems: (items: CollectionItem[]) => void;
  toggleItem: (item: CollectionItem) => void;
  visibleColumns?: CollectionContentTableColumn[];
  onClick: (item: CollectionItem) => void;
}>;

const DefaultEmptyContentComponent = ({
  collection,
}: {
  collection?: Collection;
}) => {
  return (
    <CollectionEmptyContent>
      <CollectionEmptyState collection={collection} />
    </CollectionEmptyContent>
  );
};

export const CollectionItemsTable = ({
  bookmarks,
  collection,
  collectionId,
  clear,
  createBookmark,
  databases,
  deleteBookmark,
  EmptyContentComponent = DefaultEmptyContentComponent,
  getIsSelected,
  handleCopy,
  handleMove,
  hasPinnedItems,
  loadingPinnedItems,
  models = ALL_MODELS,
  pageSize = COLLECTION_PAGE_SIZE,
  selected,
  selectOnlyTheseItems,
  toggleItem,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS_LIST,
  onClick,
}: CollectionItemsTableProps) => {
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);

  const [unpinnedItemsSorting, setUnpinnedItemsSorting] =
    useState<SortingOptions>(() => getDefaultSortingOptions(collection));

  const [total, setTotal] = useState<number>();

  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();

  useEffect(() => {
    if (collectionId) {
      resetPage();
      setTotal(undefined);
    }
  }, [collectionId, resetPage]);

  const handleUnpinnedItemsSortingChange = useCallback(
    (sortingOpts: SortingOptions) => {
      setUnpinnedItemsSorting(sortingOpts);
      setPage(0);
    },
    [setPage],
  );

  const showAllItems = isEmbeddingSdk || isRootTrashCollection(collection);

  return (
    <CollectionItemsTableContent
      bookmarks={bookmarks}
      clear={clear}
      collection={collection}
      createBookmark={createBookmark}
      databases={databases}
      deleteBookmark={deleteBookmark}
      EmptyContentComponent={EmptyContentComponent}
      getIsSelected={getIsSelected}
      handleCopy={handleCopy}
      handleMove={handleMove}
      hasPinnedItems={hasPinnedItems}
      loadingPinnedItems={loadingPinnedItems}
      page={page}
      selected={selected}
      selectOnlyTheseItems={selectOnlyTheseItems}
      toggleItem={toggleItem}
      total={total}
      unpinnedItemsSorting={unpinnedItemsSorting}
      unpinnedQuery={{
        collection: collectionId,
        models,
        limit: pageSize,
        offset: pageSize * page,
        ...(showAllItems
          ? { show_dashboard_questions: true }
          : { pinned_state: "is_not_pinned" }),
        ...unpinnedItemsSorting,
      }}
      visibleColumns={visibleColumns}
      onClick={onClick}
      onNextPage={handleNextPage}
      onPreviousPage={handlePreviousPage}
      onUnpinnedItemsSortingChange={handleUnpinnedItemsSortingChange}
    />
  );
};

type CollectionItemsTableContentProps = CollectionItemsTableProps & {
  list: CollectionItem[] | undefined;
  loading: boolean;
  page: number;
  total: number | undefined;
  unpinnedItemsSorting: SortingOptions;
  unpinnedQuery: ListCollectionItemsRequest;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onUnpinnedItemsSortingChange: (unpinnedItemsSorting: SortingOptions) => void;
};

const CollectionItemsTableContentInner = ({
  bookmarks,
  clear,
  collection,
  createBookmark,
  databases,
  deleteBookmark,
  EmptyContentComponent = DefaultEmptyContentComponent,
  getIsSelected,
  handleCopy,
  handleMove,
  hasPinnedItems,
  list: unpinnedItems = [],
  loading: loadingUnpinnedItems,
  loadingPinnedItems,
  page,
  pageSize = COLLECTION_PAGE_SIZE,
  selected,
  selectOnlyTheseItems,
  toggleItem,
  total,
  unpinnedItemsSorting,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS_LIST,
  onClick,
  onNextPage,
  onPreviousPage,
  onUnpinnedItemsSortingChange,
}: CollectionItemsTableContentProps) => {
  const visibleColumnsMap = useMemo(
    () => getVisibleColumnsMap(visibleColumns),
    [visibleColumns],
  );

  const hasPagination: boolean = total ? total > pageSize : false;

  const unselected = getIsSelected
    ? unpinnedItems.filter(item => !getIsSelected(item))
    : unpinnedItems;
  const hasUnselected = unselected.length > 0;

  const handleSelectAll = () => {
    selectOnlyTheseItems?.(unpinnedItems);
  };

  const loading = loadingPinnedItems || loadingUnpinnedItems;
  const isEmpty = !loading && !hasPinnedItems && unpinnedItems.length === 0;

  if (isEmpty && !loadingUnpinnedItems) {
    return <EmptyContentComponent collection={collection} />;
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
        onSortingOptionsChange={onUnpinnedItemsSortingChange}
        selectedItems={selected}
        hasUnselected={hasUnselected}
        getIsSelected={getIsSelected}
        onToggleSelected={toggleItem}
        onDrop={clear}
        onMove={handleMove}
        onCopy={handleCopy}
        onSelectAll={handleSelectAll}
        onSelectNone={clear}
        onClick={onClick}
        visibleColumnsMap={visibleColumnsMap}
      />
      <div className={cx(CS.flex, CS.justifyEnd, CS.my3)}>
        {hasPagination && (
          <PaginationControls
            showTotal
            page={page}
            pageSize={pageSize}
            total={total}
            itemsLength={unpinnedItems.length}
            onNextPage={onNextPage}
            onPreviousPage={onPreviousPage}
          />
        )}
      </div>
    </CollectionTable>
  );
};

const CollectionItemsTableContent = Search.loadList({
  query: (_state: State, props: CollectionItemsTableContentProps) => {
    return props.unpinnedQuery;
  },
  loadingAndErrorWrapper: false,
  wrapped: true,
})(CollectionItemsTableContentInner);
