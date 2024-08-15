/* eslint-disable react/prop-types */
import { AgGridReact, type AgGridReactProps } from 'ag-grid-react'; // React Data Grid Component
import cx from "classnames";
import { type ComponentType, useCallback, useState } from "react";
import { t } from "ttag";

import "ag-grid-community/styles/ag-grid.css"; // Mandatory CSS required by the Data Grid

import { collectionApi, useListCollectionItemsQuery } from 'metabase/api';
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
import DateTime from 'metabase/components/DateTime';
import { ItemsTable } from "metabase/components/ItemsTable";
import { EntityIconCheckBox } from 'metabase/components/ItemsTable/BaseItemsTable.styled';
import { Columns, getLastEditedBy } from 'metabase/components/ItemsTable/Columns';
import { PaginationControls } from "metabase/components/PaginationControls";
import CS from "metabase/css/core/index.css";
import { getIcon } from 'metabase/entities/questions';
import Search from "metabase/entities/search";
import { usePagination } from "metabase/hooks/use-pagination";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { Box, Button } from 'metabase/ui';
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import ActionMenu from '../ActionMenu';

import {
  CollectionEmptyContent,
  CollectionTable,
} from "./CollectionContent.styled";

import type { IGetRowsParams } from 'ag-grid-community';



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

  const [total, setTotal] = useState<number | null>(pageSize);

  const [page, setPage] = useState(0);

  // useEffect(() => {
  //   if (collectionId) {
  //     // resetPage();
  //     setTotal(null);
  //   }
  // }, [collectionId, resetPage]);

  // const handleUnpinnedItemsSortingChange = useCallback(
  //   (sortingOpts: SortingOptions) => {
  //     setUnpinnedItemsSorting(sortingOpts);
  //     setPage(0);
  //   },
  //   [setPage],
  // );

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

  // const { data: unpinnedItems } = useListCollectionItemsQuery({
  //   id: collectionId,
  //   pinned_state: "is_not_pinned",
  //   limit: pageSize,
  //   offset: pageSize * page,
  // });


  // Column Definitions: Defines the columns to be displayed.
  const colDefs: AgGridReactProps["columnDefs"] = [
    { checkboxSelection: true, width: 40 },
    { field: "name", width: 300, filter: true },
    // { field: "model", headerName: "Type", filter: true, width: 100,
    //   cellRenderer: ({ data: item }) =>
    //       (
    //       <EntityIconCheckBox
    //         variant="list"
    //         icon={getIcon(item)}
    //         pinned={false}
    //       />
    //     )
    //  },
    // {
    //   field: "name",
    //   headerName: t`Name`,
    //   filter: () => {
    //     return (
    //       <Box p="lg">
    //         <img src="https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHRuOG5pZXgzbTVuajA4MTU0Y3BqNnZ1NjhoZzJxbmFqZWkxZHI1MiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/vnGlErQHuF9BK/giphy.gif" />
    //       </Box>
    //     )
    //   },
    //   cellRenderer: ({ data: item }) => (
    //     <Columns.Name.Cell
    //       item={item}
    //       testIdPrefix="table"
    //       onClick={onClick}
    //     />
    //   )
    // },
    // {
    //   field: "last-edited-by",
    //   headerName: "Last Edited By",
    //   valueGetter: ({ data: item }: { data: CollectionItem }) => getLastEditedBy(item?.["last-edit-info"]),
    // },
    // {
    //   field: "last-edited-at",
    //   headerName: "Last Edited At",
    //   valueGetter: ({ data: item }: { data: CollectionItem }) => item?.["last-edit-info"]?.timestamp ?? '',
    //   cellRenderer: ({ value }: { value: string }) => (
    //     <DateTime unit="day" value={value} />
    //   )
    // },
    // {
    //   field: "action-menu",
    //   headerName: "",
    //   cellRenderer: ({ data: item }: { data: CollectionItem }) => {
    //     return (
    //       // <ActionMenu
    //       //   item={item}
    //       //   collection={collection}
    //       //   databases={databases}
    //       //   bookmarks={bookmarks}
    //       //   // onCopy={onCopy}
    //       //   // onMove={onMove}
    //       //   createBookmark={createBookmark}
    //       //   deleteBookmark={deleteBookmark}
    //       // />
    //       <>
    //         <Button onClick={() => console.log('copy', item)}>click me</Button>
    //       </>
    //     );
    //   },
    // }
  ];

  // if(!unpinnedItems) {
  //   return <div>Loading...</div>;
  // }

  const onGridReady = useCallback((params) => {
    const dataSource = {
      rowCount: pageSize,
      getRows: async ({ startRow, successCallback, failCallback }) => {
        console.log('asking for ' + params.startRow + ' to ' + params.endRow);

        const response = await fetch(`/api/collection/${collectionId}/items?pinned_state=is_not_pinned&limit=${pageSize}&offset=${startRow / pageSize}`);

          const body = await response.json();

          const { data, total } = body;

          setTotal(pageSize);

          if(!data) {
            failCallback();
          }

          console.log(data)

          data
            ? successCallback(data)
            : failCallback();
        },
      };

    params.api.setGridOption('datasource', dataSource);
}, []);

  return (
    // wrapping container with theme & size
    <>
      <div
        className="ag-theme-quartz" // applying the Data Grid theme
        style={{ height: 400, width: '100%' }} // the Data Grid will fill the size of the parent container
        nonce={window.MetabaseNonce}
      >
        <AgGridReact
          columnDefs={colDefs}
          infiniteInitialRowCount={25}
          rowModelType='infinite'
          onGridReady={onGridReady}
          // rowData={unpinnedItems.data}
          // rowSelection="multiple"
          // enableCellTextSelection={false}
        />
      </div>
    </>
  );
};
