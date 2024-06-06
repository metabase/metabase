import type { HTMLAttributes, MouseEvent, PropsWithChildren } from "react";
import { useMemo } from "react";

import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
  OnToggleSelectedWithItem,
} from "metabase/collections/types";
import { isTrashedCollection } from "metabase/collections/utils";
import { BaseItemsTableBody } from "metabase/components/ItemsTable/BaseItemsTableBody/BaseItemsTableBody";
import type { ItemRendererProps } from "metabase/components/ItemsTable/DefaultItemRenderer";
import { DefaultItemRenderer } from "metabase/components/ItemsTable/DefaultItemRenderer";
import { Center, Loader } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import {
  ColumnHeader,
  SortingControlContainer,
  SortingIcon,
  Table,
} from "../BaseItemsTable.styled";
import { Columns } from "../Columns";
import type { ResponsiveProps } from "../utils";

export type SortableColumnHeaderProps = {
  name?: string;
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
  ItemComponent?: (props: ItemRendererProps) => JSX.Element;
  includeColGroup?: boolean;
  onClick?: (item: CollectionItem, event: MouseEvent) => void;
  isLoading?: boolean;
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
  onClick,
  isLoading,
  ...props
}: BaseItemsTableProps) => {
  const canSelect =
    collection?.can_write && typeof onToggleSelected === "function";
  const isTrashed = !!collection && isTrashedCollection(collection);

  if (isLoading) {
    return (
      <Center>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Table isInDragLayer={isInDragLayer} {...props}>
      {includeColGroup && (
        <colgroup>
          {canSelect && <Columns.Select.Col />}
          <Columns.Type.Col />
          <Columns.Name.Col isInDragLayer={isInDragLayer} />
          <Columns.LastEditedBy.Col />
          <Columns.LastEditedAt.Col />
          <Columns.ActionMenu.Col />
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
            <Columns.Type.Header
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            />
            <Columns.Name.Header
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            />
            <Columns.LastEditedBy.Header
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
              isTrashed={isTrashed}
            />
            <Columns.LastEditedAt.Header
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
              isTrashed={isTrashed}
            />
            <Columns.ActionMenu.Header />
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
      />
    </Table>
  );
};

BaseItemsTable.Item = DefaultItemRenderer;
