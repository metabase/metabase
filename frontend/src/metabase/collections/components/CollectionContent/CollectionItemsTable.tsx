import cx from "classnames";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import NoResultsImg from "assets/img/no_results.svg";
import {
  skipToken,
  useGetCollectionItemsMetadataQuery,
  useListCollectionItemsQuery,
} from "metabase/api";
import {
  ALL_MODELS,
  COLLECTION_PAGE_SIZE,
  type CollectionContentTableColumn,
  DEFAULT_VISIBLE_COLUMNS_LIST,
  FILTERS_VISIBILITY_THRESHOLD,
} from "metabase/collections/components/CollectionContent/constants";
import CollectionEmptyState from "metabase/collections/components/CollectionEmptyState";
import { trackCollectionItemsFiltered } from "metabase/common/collections/analytics";
import type {
  CreateBookmark,
  DeleteBookmark,
} from "metabase/common/collections/types";
import { isRootTrashCollection } from "metabase/common/collections/utils";
import { EmptyState } from "metabase/common/components/EmptyState";
import { ItemsTable } from "metabase/common/components/ItemsTable";
import { getVisibleColumnsMap } from "metabase/common/components/ItemsTable/utils";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { usePagination } from "metabase/common/hooks/use-pagination";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Box } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  Database,
  ListCollectionItemsRequest,
  ListCollectionItemsSortColumn,
  SortingOptions,
} from "metabase-types/api";

import S from "./CollectionContent.module.css";
import { CollectionItemsToolbar } from "./CollectionItemsToolbar";

const shouldDebounceSearchText = (
  _lastSearchText: string,
  nextSearchText: string,
) => nextSearchText.trim().length > 0;

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

// `itemsSorting` keeps the snake_case `SortingOptions` shape that `BaseItemsTable` emits, which is shared with
// tables driving endpoints that still take snake_case (e.g. /api/ee/stale/:id). The collection items endpoint
// takes kebab-case, so translate here rather than changing the shared UI type.
const toItemsSortingParams = (
  sorting: SortingOptions<ListCollectionItemsSortColumn>,
) => ({
  "sort-column": sorting.sort_column,
  "sort-direction": sorting.sort_direction,
});

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
  showFilterBar: boolean;
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
    <Box mt="15vh">
      <CollectionEmptyState collection={collection} />
    </Box>
  );
};

const CollectionNoResults = ({ hasSearchText }: { hasSearchText: boolean }) => (
  <Box my="4rem" data-testid="collection-filter-empty-state">
    <EmptyState
      title={t`Didn't find anything`}
      message={
        hasSearchText
          ? t`There weren't any results for your search.`
          : t`No items of the selected types.`
      }
      illustrationElement={<img src={NoResultsImg} alt={t`No results`} />}
    />
  </Box>
);

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
  showFilterBar,
  showDashboardQuestions = true,
  selected,
  selectOnlyTheseItems,
  toggleItem,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS_LIST,
  onClick,
}: CollectionItemsTableProps) => {
  const [search, setSearch] = useState({ collectionId, value: "" });
  const searchText = search.collectionId === collectionId ? search.value : "";
  const [filterSelection, setFilterSelection] = useState<{
    collectionId?: CollectionId;
    value: CollectionItemModel[] | null;
  }>({ collectionId, value: null });
  const selectedFilters =
    filterSelection.collectionId === collectionId
      ? filterSelection.value
      : null;
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
    shouldDebounceSearchText,
  );
  const trimmedSearchText =
    searchText.trim().length > 0 ? debouncedSearchText.trim() : "";
  const previousTrimmedSearchText = usePrevious(trimmedSearchText);

  const [itemsSorting, setItemsSorting] = useState<
    SortingOptions<ListCollectionItemsSortColumn>
  >(() => getDefaultSortingOptions(collection));

  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();

  useEffect(() => {
    resetPage();
    setSearch({ collectionId, value: "" });
    setFilterSelection({ collectionId, value: null });
  }, [collectionId, resetPage]);

  useEffect(() => {
    if (previousTrimmedSearchText === "" && trimmedSearchText.length > 0) {
      trackCollectionItemsFiltered({ collectionId, filter: "search" });
    }
  }, [collectionId, previousTrimmedSearchText, trimmedSearchText]);

  const handleSearchTextChange = useCallback(
    (value: string) => {
      setSearch({ collectionId, value });
      setPage(0);
    },
    [collectionId, setPage],
  );

  const handleSelectedFiltersChange = useCallback(
    (nextFilters: CollectionItemModel[] | null) => {
      if (selectedFilters == null && nextFilters != null) {
        trackCollectionItemsFiltered({ collectionId, filter: "type" });
      }
      setFilterSelection({ collectionId, value: nextFilters });
      setPage(0);
    },
    [collectionId, selectedFilters, setPage],
  );

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

  // `currentData` is per collection, so a previous collection's metadata never drives this one's toolbar.
  const { currentData: itemsMetadata } = useGetCollectionItemsMetadataQuery(
    collectionId === undefined || !showFilterBar
      ? skipToken
      : {
          id: collectionId,
          models,
          "show-dashboard-questions": showDashboardQuestionsInList,
        },
  );
  const availableModels = itemsMetadata?.available_models ?? [];
  const totalItems = itemsMetadata?.total_items ?? 0;

  const showToolbar =
    Boolean(showFilterBar) && totalItems > FILTERS_VISIBILITY_THRESHOLD;
  // The toolbar can disappear while a search or type filter is active, e.g. after
  // archiving items; ignore the leftover selection rather than filtering a bare list.
  const appliedSearchText = showToolbar ? trimmedSearchText : "";
  const appliedFilters = showToolbar ? selectedFilters : null;

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
      searchText={showToolbar ? searchText : ""}
      selectedFilters={appliedFilters}
      selected={selected}
      selectOnlyTheseItems={selectOnlyTheseItems}
      showToolbar={showToolbar}
      toggleItem={toggleItem}
      itemsSorting={itemsSorting}
      itemsQuery={
        collectionId === undefined
          ? skipToken
          : {
              id: collectionId,
              models: appliedFilters ?? models,
              limit: pageSize,
              offset: pageSize * page,
              "show-dashboard-questions": showDashboardQuestionsInList,
              ...toItemsSortingParams(itemsSorting),
              ...(appliedSearchText.length > 0 ? { q: appliedSearchText } : {}),
            }
      }
      availableModels={availableModels}
      visibleColumns={visibleColumns}
      onClick={onClick}
      onNextPage={handleNextPage}
      onPreviousPage={handlePreviousPage}
      onSearchTextChange={handleSearchTextChange}
      onSelectedFiltersChange={handleSelectedFiltersChange}
      onItemsSortingChange={handleItemsSortingChange}
    />
  );
};

type CollectionItemsTableContentProps = CollectionItemsTableProps & {
  page: number;
  searchText: string;
  selectedFilters: CollectionItemModel[] | null;
  showToolbar: boolean;
  availableModels: string[];
  itemsSorting: SortingOptions<ListCollectionItemsSortColumn>;
  itemsQuery: ListCollectionItemsRequest | typeof skipToken;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onSearchTextChange: (searchText: string) => void;
  onSelectedFiltersChange: (filters: CollectionItemModel[] | null) => void;
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
  searchText,
  selectedFilters,
  selected,
  selectOnlyTheseItems,
  showToolbar,
  availableModels,
  toggleItem,
  itemsSorting,
  itemsQuery,
  visibleColumns,
  onClick,
  onNextPage,
  onPreviousPage,
  onSearchTextChange,
  onSelectedFiltersChange,
  onItemsSortingChange,
}: CollectionItemsTableContentProps) => {
  const { data, isFetching } = useListCollectionItemsQuery(itemsQuery);

  const items = data?.data ?? [];
  const totalMatchingItems = data?.total;
  const visibleColumnsMap = useMemo(
    () => getVisibleColumnsMap(visibleColumns),
    [visibleColumns],
  );

  const hasPagination: boolean = totalMatchingItems
    ? totalMatchingItems > pageSize
    : false;

  const unselected = getIsSelected
    ? items.filter((item) => !getIsSelected(item))
    : items;
  const hasUnselected = unselected.length > 0;

  const handleSelectAll = () => {
    selectOnlyTheseItems?.(items);
  };

  const hasSearchQuery =
    itemsQuery !== skipToken && Boolean(itemsQuery.q?.trim());
  const hasSearchText = searchText.trim().length > 0 || hasSearchQuery;
  const hasActiveFilters = hasSearchText || selectedFilters != null;
  const isSearching = isFetching && hasSearchQuery;
  const isEmpty = !isFetching && items.length === 0 && !hasActiveFilters;

  if (isEmpty) {
    return <EmptyContentComponent collection={collection} />;
  }

  const showNoResults = !isFetching && hasActiveFilters && items.length === 0;
  const showTable = !showNoResults;

  return (
    <>
      {showToolbar && (
        <CollectionItemsToolbar
          searchText={searchText}
          availableModels={availableModels}
          selectedFilters={selectedFilters}
          onSearchTextChange={onSearchTextChange}
          onSelectedFiltersChange={onSelectedFiltersChange}
          isSearching={isSearching}
        />
      )}
      {showNoResults && <CollectionNoResults hasSearchText={hasSearchText} />}
      {showTable && (
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
                total={totalMatchingItems}
                itemsLength={items.length}
                onNextPage={onNextPage}
                onPreviousPage={onPreviousPage}
              />
            )}
          </div>
        </Box>
      )}
    </>
  );
};
