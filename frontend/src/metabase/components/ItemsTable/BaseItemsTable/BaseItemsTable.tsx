import { useMemo } from "react";
import type { HTMLAttributes, PropsWithChildren } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
  OnToggleSelectedWithItem,
} from "metabase/collections/types";
import { isTrashedCollection } from "metabase/collections/utils";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import {
  type SortColumn,
  SortDirection,
  type SortingOptions,
} from "metabase-types/api/sorting";
import { TableRow } from "metabase/components/ItemsTable/BaseItemTableRow";

import {
  ColumnHeader,
  SortingControlContainer,
  SortingIcon,
  Table,
} from "../BaseItemsTable.styled";
import { getColumns } from "../Columns";
import type { ResponsiveProps } from "../utils";
import { TBody } from "../BaseItemsTable.styled";

export type SortableColumnHeaderProps = {
  name?: SortColumn;
  sortingOptions?: SortingOptions;
  onSortingOptionsChange?: (newSortingOptions: SortingOptions) => void;
  columnHeaderProps?: Partial<HTMLAttributes<HTMLTableHeaderCellElement>>;
} & PropsWithChildren<Partial<HTMLAttributes<HTMLDivElement>>>;

export const SortableColumnHeader = ({
  name,
  sortingOptions,
  onSortingOptionsChange,
  children,
  hideAtContainerBreakpoint,
  containerName,
  columnHeaderProps,
  ...props
}: SortableColumnHeaderProps & ResponsiveProps) => {
  const isSortable = !!onSortingOptionsChange && !!name;
  const isSortingThisColumn = sortingOptions?.sort_column === name;
  const direction = isSortingThisColumn
    ? sortingOptions?.sort_direction
    : SortDirection.Desc;

  const onSortingControlClick = useMemo(() => {
    if (!isSortable) {
      return undefined;
    }
    const handler = () => {
      const nextDirection =
        direction === SortDirection.Asc
          ? SortDirection.Desc
          : SortDirection.Asc;
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
            name={direction === SortDirection.Asc ? "chevronup" : "chevrondown"}
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
  sortingOptions?: SortingOptions;
  onSortingOptionsChange?: (newSortingOptions: SortingOptions) => void;
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
  includeColGroup?: boolean;
  onClick?: (item: CollectionItem) => void;
  showActionMenu?: boolean;
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
  includeColGroup = true,
  showActionMenu = true,
  onClick,
  ...props
}: BaseItemsTableProps) => {
  const canSelect =
    collection?.can_write && typeof onToggleSelected === "function";
  const isTrashed = !!collection && isTrashedCollection(collection);

  const table = useReactTable({
    data: items,
    columns: getColumns({
      sortingOptions,
      onSortingOptionsChange,
      isTrashed,
      collection,
      databases,
      bookmarks,
      onCopy,
      onMove,
      createBookmark,
      deleteBookmark,
      showActionMenu,
      selectedItems,
      hasUnselected,
      onSelectAll,
      onSelectNone,
      onToggleSelected,
      canSelect,
      isInDragLayer,
      getIsSelected,
    }),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table isInDragLayer={isInDragLayer} {...props}>
      {includeColGroup &&
        table
          .getHeaderGroups()
          .map(headerGroup => (
            <colgroup key={headerGroup.id}>
              {headerGroup.headers.map(header =>
                header.column.columnDef.size !== 0 ? (
                  <col
                    key={header.id}
                    style={{ width: header.column.columnDef.size }}
                  />
                ) : null,
              )}
            </colgroup>
          ))}

      {!headless && (
        <thead
          data-testid={
            isPinned ? "pinned-items-table-head" : "items-table-head"
          }
        >
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header =>
                flexRender(header.column.columnDef.header, header.getContext()),
              )}
            </tr>
          ))}
        </thead>
      )}

      <TBody>
        {table.getRowModel().rows.map(row => {
          const item = row.original;
          const isSelected = getIsSelected(item);

          const testIdPrefix = `${isPinned ? "pinned-" : ""}collection-entry`;
          const itemKey = `${item.model}-${item.id}`;

          return (
            <TableRow
              key={itemKey}
              itemKey={itemKey}
              testIdPrefix={testIdPrefix}
              item={item}
              isSelected={isSelected}
              selectedItems={selectedItems}
              onDrop={onDrop}
              collection={collection}
              databases={databases}
              bookmarks={bookmarks}
              createBookmark={createBookmark}
              deleteBookmark={deleteBookmark}
              onCopy={onCopy}
              onMove={onMove}
              onToggleSelected={onToggleSelected}
              items={items}
              onClick={onClick}
              showActionMenu={showActionMenu}
            >
              {row
                .getVisibleCells()
                .map(cell =>
                  flexRender(cell.column.columnDef.cell, cell.getContext()),
                )}
            </TableRow>
          );
        })}
      </TBody>
    </Table>
  );
};
