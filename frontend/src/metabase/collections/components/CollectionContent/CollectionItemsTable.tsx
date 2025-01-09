/* eslint-disable react/prop-types */
import cx from "classnames";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useListCollectionItemsQuery } from "metabase/api";
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
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";
import { isObject } from "metabase-types/guards";

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

const isWrappedResponse = <Data extends object>(
  value: unknown,
): value is { data: Data; total: number } => {
  return isObject(value) && typeof value.total === "number";
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
  visibleColumns?: CollectionContentTableColumn[];
  EmptyContentComponent?: ComponentType<{
    collection?: Collection;
  }>;
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
  visibleColumns = DEFAULT_VISIBLE_COLUMNS_LIST,
  EmptyContentComponent = DefaultEmptyContentComponent,
}: CollectionItemsTableProps) => {
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);

  const [unpinnedItemsSorting, setUnpinnedItemsSorting] =
    useState<SortingOptions>(() => getDefaultSortingOptions(collection));

  const [total, setTotal] = useState<number | null>(null);

  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();

  const visibleColumnsMap = useMemo(
    () => getVisibleColumnsMap(visibleColumns),
    [visibleColumns],
  );

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

  const showAllItems = isEmbeddingSdk || isRootTrashCollection(collection);

  const { data, isFetching: loadingUnpinnedItems } =
    useListCollectionItemsQuery({
      id: collectionId,
      models,
      limit: pageSize,
      offset: pageSize * page,
      ...(showAllItems
        ? { show_dashboard_questions: true }
        : { pinned_state: "is_not_pinned" }),
      ...unpinnedItemsSorting,
    });

  const hasPagination: boolean = total ? total > pageSize : false;
  const dispatch = useDispatch();
  const unpinnedItems = useMemo(() => {
    return data?.data?.map(item => Search.wrapEntity(item, dispatch)) ?? [];
  }, [data, dispatch]);

  const unselected = getIsSelected
    ? unpinnedItems.filter(item => !getIsSelected(item))
    : unpinnedItems;
  const hasUnselected = unselected.length > 0;

  const handleSelectAll = () => {
    selectOnlyTheseItems?.(unpinnedItems);
  };

  const loading = loadingPinnedItems || loadingUnpinnedItems;
  const isEmpty = !loading && !hasPinnedItems && unpinnedItems.length === 0;

  useEffect(() => {
    if (isWrappedResponse(data)) {
      setTotal(data.total);
    }
  }, [data]);

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
        onClick={onClick}
        visibleColumnsMap={visibleColumnsMap}
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
};
