import type { HTMLAttributes, PropsWithChildren } from "react";
import { useMemo } from "react";

import type { CollectionContentTableColumnsMap } from "metabase/collections/components/CollectionContent";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
  OnToggleSelectedWithItem,
} from "metabase/collections/types";
import {
  isLibraryCollection,
  isRootTrashCollection,
  isTrashedCollection,
} from "metabase/collections/utils";
import { BaseItemsTableBody } from "metabase/common/components/ItemsTable/BaseItemsTableBody/BaseItemsTableBody";
import type { ItemRendererProps } from "metabase/common/components/ItemsTable/DefaultItemRenderer";
import { DefaultItemRenderer } from "metabase/common/components/ItemsTable/DefaultItemRenderer";
import type Database from "metabase-lib/v1/metadata/Database";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  ListCollectionItemsSortColumn,
  SortDirection,
  SortingOptions,
} from "metabase-types/api";

import {
  ColumnHeader,
  SortingControlContainer,
  SortingIcon,
  Table,
} from "../BaseItemsTable.styled";
import { Columns } from "../Columns";
import { getCanSelect, type ResponsiveProps } from "../utils";

export type SortableColumnHeaderProps<SortColumn extends string> = {
  name?: SortColumn;
  sortingOptions?: SortingOptions<SortColumn>;
  onSortingOptionsChange?: (
    newSortingOptions: SortingOptions<SortColumn>,
  ) => void;
  columnHeaderProps?: Partial<HTMLAttributes<HTMLTableHeaderCellElement>>;
} & PropsWithChildren<Partial<HTMLAttributes<HTMLDivElement>>>;

export const SortableColumnHeader = <SortColumn extends string>({
  name,
  sortingOptions,
  onSortingOptionsChange,
  children,
  hideAtContainerBreakpoint,
  containerName,
  columnHeaderProps,
  ...props
}: SortableColumnHeaderProps<SortColumn> & ResponsiveProps) => {
  const isSortable = !!onSortingOptionsChange && !!name;
  const isSortingThisColumn = sortingOptions?.sort_column === name;
  const direction = isSortingThisColumn
    ? sortingOptions?.sort_direction
    : "desc";

  const onSortingControlClick = useMemo(() => {
    if (!isSortable) {
      return undefined;
    }
    const handler = () => {
      const nextDirection: SortDirection = direction === "asc" ? "desc" : "asc";
      const newSortingOptions = {
        sort_column: name,
        sort_direction: nextDirection,
      };
      onSortingOptionsChange?.(newSortingOptions);
    };
    return handler;
  }, [direction, isSortable, name, onSortingOptionsChange]);

  return (
    <ColumnHeader
      hideAtContainerBreakpoint={hideAtContainerBreakpoint}
      containerName={containerName}
      {...columnHeaderProps}
    >
      <SortingControlContainer
        {...props}
        isActive={isSortingThisColumn}
        onClick={onSortingControlClick}
        role="button"
        isSortable={isSortable}
      >
        {children}
        {isSortable && (
          <SortingIcon
            name={direction === "asc" ? "chevronup" : "chevrondown"}
          />
        )}
      </SortingControlContainer>
    </ColumnHeader>
  );
};

export type BaseItemsTableProps = {
  items: CollectionItem[];
  collection?: Collection;
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark?: CreateBookmark;
  deleteBookmark?: DeleteBookmark;
  selectedItems?: CollectionItem[];
  hasUnselected?: boolean;
  isPinned?: boolean;
  sortingOptions?: SortingOptions<ListCollectionItemsSortColumn>;
  onSortingOptionsChange?: (
    newSortingOptions: SortingOptions<ListCollectionItemsSortColumn>,
  ) => void;
  onToggleSelected?: OnToggleSelectedWithItem;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  onCopy?: OnCopy;
  onMove?: OnMove;
  onDrop?: () => void;
  getIsSelected?: (item: any) => boolean;
  /** Used for dragging */
  headless?: boolean;
  isInDragLayer?: boolean;
  ItemComponent?: (props: ItemRendererProps) => JSX.Element;
  includeColGroup?: boolean;
  onClick?: (item: CollectionItem) => void;
  visibleColumnsMap: CollectionContentTableColumnsMap;
} & Partial<Omit<HTMLAttributes<HTMLTableElement>, "onCopy" | "onClick">>;

export const BaseItemsTable = ({
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  items,
  collection,
  selectedItems,
  hasUnselected,
  isPinned,
  onCopy,
  onMove,
  onDrop,
  sortingOptions,
  onSortingOptionsChange,
  onToggleSelected,
  onSelectAll,
  onSelectNone,
  getIsSelected = () => false,
  headless = false,
  isInDragLayer = false,
  ItemComponent = DefaultItemRenderer,
  includeColGroup = true,
  visibleColumnsMap,
  onClick,
  ...props
}: BaseItemsTableProps) => {
  const canSelect = getCanSelect(collection, onToggleSelected);

  const isTrashed = !!collection && isTrashedCollection(collection);

  return (
    <Table isInDragLayer={isInDragLayer} {...props}>
      {includeColGroup && (
        <colgroup>
          {canSelect && <Columns.Select.Col />}
          {visibleColumnsMap["type"] && <Columns.Type.Col />}
          {visibleColumnsMap["name"] && (
            <Columns.Name.Col
              isInDragLayer={isInDragLayer}
              width={visibleColumnsMap["typeWithName"] ? "24rem" : undefined}
            />
          )}
          {visibleColumnsMap["description"] && <Columns.Description.Col />}
          {visibleColumnsMap["lastEditedBy"] && <Columns.LastEditedBy.Col />}
          {visibleColumnsMap["lastEditedAt"] && <Columns.LastEditedAt.Col />}
          {visibleColumnsMap["actionMenu"] && <Columns.ActionMenu.Col />}
          {visibleColumnsMap["archive"] && <Columns.Archive.Col />}
          {visibleColumnsMap["dataStudioLink"] && (
            <Columns.DataStudioLink.Col />
          )}
          <Columns.RightEdge.Col />
        </colgroup>
      )}
      {!headless && (
        <thead
          data-testid={
            isPinned ? "pinned-items-table-head" : "items-table-head"
          }
        >
          <tr>
            {canSelect && (
              <Columns.Select.Header
                selectedItems={selectedItems}
                hasUnselected={hasUnselected}
                onSelectAll={onSelectAll}
                onSelectNone={onSelectNone}
              />
            )}
            {visibleColumnsMap["type"] && (
              <Columns.Type.Header
                sortingOptions={sortingOptions}
                onSortingOptionsChange={onSortingOptionsChange}
              />
            )}
            {visibleColumnsMap["name"] && (
              <Columns.Name.Header
                sortingOptions={sortingOptions}
                onSortingOptionsChange={onSortingOptionsChange}
              />
            )}
            {visibleColumnsMap["description"] && (
              <Columns.Description.Header
                sortingOptions={sortingOptions}
                onSortingOptionsChange={onSortingOptionsChange}
              />
            )}
            {visibleColumnsMap["lastEditedBy"] && (
              <Columns.LastEditedBy.Header
                sortingOptions={sortingOptions}
                onSortingOptionsChange={onSortingOptionsChange}
                isTrashed={isTrashed}
              />
            )}
            {visibleColumnsMap["lastEditedAt"] && (
              <Columns.LastEditedAt.Header
                sortingOptions={sortingOptions}
                onSortingOptionsChange={onSortingOptionsChange}
                isTrashed={isTrashed}
              />
            )}
            {visibleColumnsMap["actionMenu"] && <Columns.ActionMenu.Header />}
            {visibleColumnsMap["archive"] && <Columns.Archive.Header />}
            <Columns.RightEdge.Header />
          </tr>
        </thead>
      )}
      <BaseItemsTableBody
        items={items}
        getIsSelected={getIsSelected}
        isPinned={isPinned}
        collection={collection}
        selectedItems={selectedItems}
        onDrop={onDrop}
        ItemComponent={ItemComponent}
        databases={databases}
        bookmarks={bookmarks}
        createBookmark={createBookmark}
        deleteBookmark={deleteBookmark}
        onCopy={onCopy}
        onMove={onMove}
        onToggleSelected={onToggleSelected}
        onClick={onClick}
        visibleColumnsMap={visibleColumnsMap}
      />
    </Table>
  );
};

BaseItemsTable.Item = DefaultItemRenderer;
