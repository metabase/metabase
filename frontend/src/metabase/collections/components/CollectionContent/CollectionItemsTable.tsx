import cx from "classnames";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
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
} from "metabase/common/collections/types";
import { isRootTrashCollection } from "metabase/common/collections/utils";
import { ItemsTable } from "metabase/common/components/ItemsTable";
import { getVisibleColumnsMap } from "metabase/common/components/ItemsTable/utils";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { usePagination } from "metabase/common/hooks/use-pagination";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Box } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  ListCollectionItemsRequest,
  ListCollectionItemsSortColumn,
  SortingOptions,
} from "metabase-types/api";

import S from "./CollectionContent.module.css";

const getDefaultSortingOptions = (
  collection: Collection | undefined,
): SortingOptions<ListCollectionItemsSortColumn> => {
  return isRootTrashCollection(collection)
    ? {
        sort_column: "last_edited_at",
        sort_direction: "desc",
      }
    : {
        sort_column: "name",
        sort_direction: "asc",
      };
};

export type CollectionItemsTableProps = {
  collectionId?: CollectionId;
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
  models: CollectionItemModel[];
  pageSize: number;
  showDashboardQuestions: boolean;
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
    <Box mt="calc(20vh - 3.5rem)">
      <CollectionEmptyState collection={collection} />
    </Box>
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
  models = ALL_MODELS,
  pageSize = COLLECTION_PAGE_SIZE,
  showDashboardQuestions = true,
  selected,
  selectOnlyTheseItems,
  toggleItem,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS_LIST,
  onClick,
}: CollectionItemsTableProps) => {
  const [itemsSorting, setItemsSorting] = useState<
    SortingOptions<ListCollectionItemsSortColumn>
  >(() => getDefaultSortingOptions(collection));

  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();

  useEffect(() => {
    if (collectionId) {
      resetPage();
    }
  }, [collectionId, resetPage]);

  const handleItemsSortingChange = useCallback(
    (sortingOpts: SortingOptions<ListCollectionItemsSortColumn>) => {
      setItemsSorting(sortingOpts);
      setPage(0);
    },
    [setPage],
  );

  // Dashboard questions are only ever listed in the SDK and in the trash.
  const showDashboardQuestionsInList =
    (isEmbeddingSdk() || isRootTrashCollection(collection)) &&
    showDashboardQuestions;

  return (
    <CollectionItemsTableContent
      bookmarks={bookmarks}
      clear={clear}
      collection={collection}
      collectionId={collectionId}
      createBookmark={createBookmark}
      databases={databases}
      deleteBookmark={deleteBookmark}
      EmptyContentComponent={EmptyContentComponent}
      getIsSelected={getIsSelected}
      handleCopy={handleCopy}
      handleMove={handleMove}
      page={page}
      pageSize={pageSize}
      selected={selected}
      selectOnlyTheseItems={selectOnlyTheseItems}
      toggleItem={toggleItem}
      itemsSorting={itemsSorting}
      itemsQuery={
        collectionId === undefined
          ? skipToken
          : {
              id: collectionId,
              models,
              limit: pageSize,
              offset: pageSize * page,
              show_dashboard_questions: showDashboardQuestionsInList,
              ...itemsSorting,
            }
      }
      visibleColumns={visibleColumns}
      onClick={onClick}
      onNextPage={handleNextPage}
      onPreviousPage={handlePreviousPage}
      onItemsSortingChange={handleItemsSortingChange}
    />
  );
};

type CollectionItemsTableContentProps = CollectionItemsTableProps & {
  page: number;
  itemsSorting: SortingOptions<ListCollectionItemsSortColumn>;
  itemsQuery: ListCollectionItemsRequest | typeof skipToken;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onItemsSortingChange: (
    itemsSorting: SortingOptions<ListCollectionItemsSortColumn>,
  ) => void;
  visibleColumns: CollectionContentTableColumn[];
};

const CollectionItemsTableContent = ({
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
  page,
  pageSize = COLLECTION_PAGE_SIZE,
  selected,
  selectOnlyTheseItems,
  toggleItem,
  itemsSorting,
  itemsQuery,
  visibleColumns,
  onClick,
  onNextPage,
  onPreviousPage,
  onItemsSortingChange,
}: CollectionItemsTableContentProps) => {
  const { data, isLoading: loadingItems } =
    useListCollectionItemsQuery(itemsQuery);

  const items = data?.data ?? [];
  const total = data?.total;
  const visibleColumnsMap = useMemo(
    () => getVisibleColumnsMap(visibleColumns),
    [visibleColumns],
  );

  const hasPagination: boolean = total ? total > pageSize : false;

  const unselected = getIsSelected
    ? items.filter((item) => !getIsSelected(item))
    : items;
  const hasUnselected = unselected.length > 0;

  const handleSelectAll = () => {
    selectOnlyTheseItems?.(items);
  };

  const isEmpty = !loadingItems && items.length === 0;

  if (isEmpty) {
    return <EmptyContentComponent collection={collection} />;
  }

  return (
    <Box className={S.table} data-testid="collection-table">
      <ItemsTable
        databases={databases}
        bookmarks={bookmarks}
        createBookmark={createBookmark}
        deleteBookmark={deleteBookmark}
        items={items}
        collection={collection}
        sortingOptions={itemsSorting}
        onSortingOptionsChange={onItemsSortingChange}
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
      <div
        className={cx(
          CS.flex,
          CS.justifyEnd,
          CS.my3,
          CS.syncStatusAwarePagination,
        )}
      >
        {hasPagination && (
          <PaginationControls
            showTotal
            page={page}
            pageSize={pageSize}
            total={total}
            itemsLength={items.length}
            onNextPage={onNextPage}
            onPreviousPage={onPreviousPage}
          />
        )}
      </div>
    </Box>
  );
};
