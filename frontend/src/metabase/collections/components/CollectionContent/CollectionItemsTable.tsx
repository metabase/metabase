/* eslint-disable react/prop-types */
import {
  type ComponentType,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import DataGrid, { type RenderRowProps } from "react-data-grid";
import CollectionItemsTableS from "./CollectionItemsTable.module.css";

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
} from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import {
  CollectionEmptyContent,
  CollectionTable,
} from "./CollectionContent.styled";
import {
  DefaultItemRenderer,
  ItemRendererProps,
} from "metabase/components/ItemsTable/DefaultItemRenderer";
import { Columns } from "metabase/components/ItemsTable/Columns";

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
  showActionMenu = true,
  EmptyContentComponent = DefaultEmptyContentComponent,
}: CollectionItemsTableProps) => {
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);

  const [unpinnedItemsSorting, setUnpinnedItemsSorting] =
    useState<SortingOptions>(() => getDefaultSortingOptions(collection));

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

  const showAllItems = isEmbeddingSdk || isRootTrashCollection(collection);

  const unpinnedQuery = {
    collection: collectionId,
    models,
    limit: pageSize,
    offset: pageSize * page,
    ...(showAllItems ? {} : { pinned_state: "is_not_pinned" }),
    ...unpinnedItemsSorting,
  };

  const onSearchListLoaded = (result: {
    payload: { metadata: { total: number } };
  }) => {
    // onLoaded returns a `payload` object with the data and metadata
    if (result.payload?.metadata?.total) {
      setTotal(result.payload.metadata.total);
    }
  };

  return (
    <Search.ListLoader
      query={unpinnedQuery}
      loadingAndErrorWrapper={false}
      keepListWhileLoading
      wrapped
      onLoaded={onSearchListLoaded}
    >
      {({
        list: unpinnedItems = [],
        loading: loadingUnpinnedItems,
      }: {
        list: CollectionItem[];
        loading: boolean;
      }) => {
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

        const manyItems = [
          ...unpinnedItems,
          ...unpinnedItems,
          ...unpinnedItems,
          ...unpinnedItems,
          ...unpinnedItems,
          ...unpinnedItems,
        ];

        if (isEmpty && !loadingUnpinnedItems) {
          return <EmptyContentComponent collection={collection} />;
        }

        // <ItemsTable
        //   databases={databases}
        //   bookmarks={bookmarks}
        //   createBookmark={createBookmark}
        //   deleteBookmark={deleteBookmark}
        //   items={unpinnedItems}
        //   collection={collection}
        //   sortingOptions={unpinnedItemsSorting}
        //   onSortingOptionsChange={handleUnpinnedItemsSortingChange}
        //   selectedItems={selected}
        //   hasUnselected={hasUnselected}
        //   getIsSelected={getIsSelected}
        //   onToggleSelected={toggleItem}
        //   onDrop={clear}
        //   onMove={handleMove}
        //   onCopy={handleCopy}
        //   onSelectAll={handleSelectAll}
        //   onSelectNone={clear}
        //   onClick={onClick}
        //   showActionMenu={showActionMenu}
        // />
        // <div className={cx(CS.flex, CS.justifyEnd, CS.my3)}>
        //   {hasPagination && (
        //     <PaginationControls
        //       showTotal
        //       page={page}
        //       pageSize={pageSize}
        //       total={total ?? undefined}
        //       itemsLength={unpinnedItems.length}
        //       onNextPage={handleNextPage}
        //       onPreviousPage={handlePreviousPage}
        //     />
        //   )}
        // </div>

        // {canSelect && <Columns.Select.Col />}
        // <Columns.Type.Col />
        // <Columns.Name.Col isInDragLayer={isInDragLayer} />
        // <Columns.LastEditedBy.Col />
        // <Columns.LastEditedAt.Col />
        // {showActionMenu && <Columns.ActionMenu.Col />}
        const headerSortingProps = {
          onSortingOptionsChange: handleUnpinnedItemsSortingChange,
          sortingOptions: unpinnedItemsSorting,
        };

        // FIXME: Note I have removed <CollectionTable> which used to wrap this datagrid
        return (
          <DataGrid
            className={CollectionItemsTableS.collectionItemsTable}
            rows={unpinnedItems.map(
              (item: CollectionItem) =>
                ({
                  item,
                  isSelected: false,
                  isPinned: false,
                  onToggleSelected: () => null,
                  collection: { ...item.collection, can_write: true },
                  onCopy: () => null,
                  showActionMenu: true,
                  onSortingOptionsChange: handleUnpinnedItemsSortingChange,
                } as ItemRendererProps),
            )}
            columns={[
              {
                key: "select",
                name: "",
                width: 70,
                renderHeaderCell: _props => <Columns.Select.Header />,
                renderCell: props => <Columns.Select.Cell {...props.row} />,
              },
              {
                key: "type",
                name: "Type",
                width: 70,
                sortable: true,
                renderHeaderCell: props => (
                  <Columns.Type.Header {...headerSortingProps} />
                ),
                renderCell: props => <Columns.Type.Cell {...props.row} />,
              },
              {
                key: "name",
                name: "Name",
                renderCell: props => <Columns.Name.Cell item={props.row} />,
                sortable: true,
                renderHeaderCell: _props => (
                  <Columns.Name.Header {...headerSortingProps} />
                ),
              },
              {
                key: "last_edited_by",
                name: "Last edited by",
                width: 140,
                sortable: true,
                renderCell: props => (
                  <Columns.LastEditedBy.Cell item={props.row} />
                ),
                renderHeaderCell: _props => (
                  <Columns.LastEditedBy.Header {...headerSortingProps} />
                ),
              },
              {
                key: "last_edited_at",
                name: "Last edited at",
                width: 140,
                sortable: true,
                renderCell: props => (
                  <Columns.LastEditedAt.Cell {...props.row} />
                ),
                renderHeaderCell: _props => (
                  <Columns.LastEditedAt.Header {...headerSortingProps} />
                ),
              },
              {
                key: "action_menu",
                name: "",
                width: 100,
                renderCell: props => <Columns.ActionMenu.Cell {...props.row} />,
                renderHeaderCell: _props => <Columns.ActionMenu.Header />,
              },
              {
                key: "right_edge",
                name: "",
                renderCell: _props => <Columns.RightEdge.Cell />,
                renderHeaderCell: _props => <Columns.RightEdge.Header />,
              },
            ]}
            defaultColumnOptions={{
              sortable: true,
              resizable: true,
            }}
            renderers={{
              renderRow: (key, props: RenderRowProps<ItemRendererProps>) => (
                <tr>
                  <DefaultItemRenderer key={key} {...props.row} />
                </tr>
              ),
            }}
            rowHeight={50}
          />
        );
      }}
    </Search.ListLoader>
  );
};
