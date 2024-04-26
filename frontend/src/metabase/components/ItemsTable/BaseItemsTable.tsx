import {
  useCallback,
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
import BaseTableItem from "./BaseTableItem";
import { Columns } from "./Columns";
import type { ResponsiveProps } from "./utils";

export type SortingOptions = {
  sort_column: string;
  sort_direction: "asc" | "desc";
};

export type SortableColumnHeaderProps = {
  name?: string;
  sortingOptions?: SortingOptions;
  onSortingOptionsChange?: (newSortingOptions: SortingOptions) => void;
} & PropsWithChildren<Partial<HTMLAttributes<HTMLDivElement>>>;

export enum Sort {
  Asc = "asc",
  Desc = "desc",
}

export const SortableColumnHeader = ({
  name = "",
  sortingOptions = {
    sort_column: "",
    sort_direction: Sort.Asc,
  },
  onSortingOptionsChange,
  children,
  hideAtContainerBreakpoint,
  containerName,
  ...props
}: SortableColumnHeaderProps & ResponsiveProps) => {
  const isSortable = !!onSortingOptionsChange;
  const isSortingThisColumn = sortingOptions.sort_column === name;
  const direction = isSortingThisColumn
    ? sortingOptions.sort_direction
    : Sort.Desc;

  const onSortingControlClick = () => {
    const nextDirection = direction === Sort.Asc ? Sort.Desc : Sort.Asc;
    onSortingOptionsChange?.({
      sort_column: name,
      sort_direction: nextDirection,
    });
  };

  return (
    <ColumnHeader
      hideAtContainerBreakpoint={hideAtContainerBreakpoint}
      containerName={containerName}
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
            name={direction === Sort.Asc ? "chevronup" : "chevrondown"}
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
          const testId = `${isPinned ? "pinned-" : ""}collection-entry`;
          return (
            <ItemDragSource
              item={item}
              collection={collection}
              isSelected={isSelected}
              selected={selectedItems}
              onDrop={onDrop}
              key={`item-drag-source-${item.id}`}
            >
              <tr key={item.id} data-testid={testId} style={{ height: 48 }}>
                <ItemComponent
                  key={`${item.model}-${item.id}`}
                  testId={testId}
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

BaseItemsTable.Item = BaseTableItem;

export type ItemRendererProps = {
  item: CollectionItem;
  isSelected?: boolean;
  isPinned?: boolean;
  onToggleSelected?: OnToggleSelectedWithItem;
  collection?: Collection;
  draggable?: boolean;
  testId?: string;
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
  testId = "item-renderer",
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
          testId={`${testId}-check`}
          icon={icon}
          isPinned={isPinned}
          isSelected={isSelected}
          handleSelectionToggled={handleSelectionToggled}
        />
      )}
      <Columns.Type.Cell
        testId={`${testId}-type`}
        icon={icon}
        isPinned={isPinned}
      />
      <Columns.Name.Cell item={item} testId={`${testId}-name`} />
      <Columns.LastEditedBy.Cell
        item={item}
        testId={`${testId}-last-edited-by`}
      />
      <Columns.LastEditedAt.Cell
        item={item}
        testId={`${testId}-last-edited-at`}
      />
      <Columns.ActionMenu.Cell
        item={item}
        collection={collection}
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
