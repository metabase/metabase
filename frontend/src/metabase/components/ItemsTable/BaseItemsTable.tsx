import {
  useCallback,
  useMemo,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";

import type { ActionMenuProps } from "metabase/collections/components/ActionMenu/ActionMenu";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
  OnToggleSelectedWithItem,
} from "metabase/collections/types";
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import { color } from "metabase/lib/colors";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import {
  ColumnHeader,
  SortingControlContainer,
  SortingIcon,
  Table,
  TBody,
} from "./BaseItemsTable.styled";
import { Columns, SortDirection } from "./Columns";
import type { ResponsiveProps } from "./utils";

export type SortingOptions = {
  sort_column: string;
  sort_direction: SortDirection;
};

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
  sortingOptions: SortingOptions;
  onSortingOptionsChange: (newSortingOptions: SortingOptions) => void;
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
} & Partial<Omit<HTMLAttributes<HTMLTableElement>, "onCopy">>;

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
  ...props
}: BaseItemsTableProps) => {
  const canSelect = !!collection?.can_write;
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
            />
            <Columns.LastEditedAt.Header
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            />
            <Columns.ActionMenu.Header />
            <Columns.RightEdge.Header />
          </tr>
        </thead>
      )}
      <TBody>
        {items.map((item: CollectionItem) => {
          const isSelected = getIsSelected(item);

          const testIdPrefix = `${isPinned ? "pinned-" : ""}collection-entry`;
          const key = `${item.model}-${item.id}`;
          return (
            <ItemDragSource
              item={item}
              collection={collection}
              isSelected={isSelected}
              selected={selectedItems}
              onDrop={onDrop}
              key={`item-drag-source-${key}`}
            >
              <tr data-testid={testIdPrefix} style={{ height: 48 }}>
                <ItemComponent
                  testIdPrefix={testIdPrefix}
                  item={item}
                  isSelected={isSelected}
                  databases={databases}
                  bookmarks={bookmarks}
                  createBookmark={createBookmark}
                  deleteBookmark={deleteBookmark}
                  collection={collection}
                  isPinned={isPinned}
                  onCopy={onCopy}
                  onMove={onMove}
                  onToggleSelected={onToggleSelected}
                />
              </tr>
            </ItemDragSource>
          );
        })}
      </TBody>
    </Table>
  );
};

export type ItemRendererProps = {
  item: CollectionItem;
  isSelected?: boolean;
  isPinned?: boolean;
  onToggleSelected?: OnToggleSelectedWithItem;
  collection?: Collection;
  draggable?: boolean;
  testIdPrefix?: string;
  databases?: Database[];
  bookmarks?: Bookmark[];
} & ActionMenuProps;

const DefaultItemRenderer = ({
  item,
  isSelected,
  isPinned,
  onToggleSelected,
  collection,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
  databases,
  bookmarks,
  testIdPrefix = "item",
}: ItemRendererProps) => {
  const canSelect =
    collection?.can_write && typeof onToggleSelected === "function";

  const icon = item.getIcon();
  if (item.model === "card") {
    icon.color = color("text-light");
  }

  const handleSelectionToggled = useCallback(() => {
    onToggleSelected?.(item);
  }, [item, onToggleSelected]);

  return (
    <>
      {canSelect && (
        <Columns.Select.Cell
          testIdPrefix={testIdPrefix}
          icon={icon}
          isPinned={isPinned}
          isSelected={isSelected}
          handleSelectionToggled={handleSelectionToggled}
        />
      )}
      <Columns.Type.Cell
        testIdPrefix={testIdPrefix}
        icon={icon}
        isPinned={isPinned}
      />
      <Columns.Name.Cell item={item} testIdPrefix={testIdPrefix} />
      <Columns.LastEditedBy.Cell item={item} testIdPrefix={testIdPrefix} />
      <Columns.LastEditedAt.Cell item={item} testIdPrefix={testIdPrefix} />
      <Columns.ActionMenu.Cell
        item={item}
        collection={collection}
        databases={databases}
        bookmarks={bookmarks}
        onCopy={onCopy}
        onMove={onMove}
        createBookmark={createBookmark}
        deleteBookmark={deleteBookmark}
      />
      <Columns.RightEdge.Cell />
    </>
  );
};
BaseItemsTable.Item = DefaultItemRenderer;
