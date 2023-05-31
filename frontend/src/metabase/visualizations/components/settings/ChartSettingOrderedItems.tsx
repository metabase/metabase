import { ReactElement } from "react";

import type { SortableElementProps } from "react-sortable-hoc";
import {
  SortableContainer,
  SortableElement,
} from "metabase/components/sortable";

import ColumnItem from "./ColumnItem";

interface SortableItem {
  enabled: boolean;
  color?: string;
}

interface SortableColumnFunctions<T> {
  onRemove?: (item: T) => void;
  onEdit?: (item: T, targetElement?: HTMLElement) => void;
  onClick?: (item: T) => void;
  onAdd?: (item: T) => void;
  onEnable?: (item: T) => void;
  getItemName: (item: T) => string;
  onColorChange?: (item: T, color: string) => void;
}

interface SortableColumnProps<T> extends SortableColumnFunctions<T> {
  item: T;
  isDragDisabled: boolean;
}

const SortableColumn = SortableElement(function SortableColumn<
  T extends SortableItem,
>({
  item,
  getItemName,
  onEdit,
  onRemove,
  onClick,
  onAdd,
  onEnable,
  onColorChange,
  isDragDisabled = false,
}: SortableColumnProps<T>) {
  return (
    <ColumnItem
      title={getItemName(item)}
      onEdit={
        onEdit
          ? (targetElement?: HTMLElement) => onEdit(item, targetElement)
          : null
      }
      onRemove={onRemove && item.enabled ? () => onRemove(item) : null}
      onClick={onClick ? () => onClick(item) : null}
      onAdd={onAdd ? () => onAdd(item) : null}
      onEnable={onEnable && !item.enabled ? () => onEnable(item) : null}
      onColorChange={
        onColorChange ? (color: string) => onColorChange(item, color) : null
      }
      color={item.color}
      draggable={!isDragDisabled}
    />
  );
}) as unknown as <T extends SortableItem>(
  props: SortableColumnProps<T> & SortableElementProps,
) => ReactElement;

interface SortableColumnListProps<T extends SortableItem>
  extends SortableColumnFunctions<T> {
  items: T[];
}

const SortableColumnList = SortableContainer(function SortableColumnList<
  T extends SortableItem,
>({
  items,
  getItemName,
  onEdit,
  onRemove,
  onEnable,
  onAdd,
  onColorChange,
}: SortableColumnListProps<T>) {
  const isDragDisabled = items.length === 1;

  return (
    <div>
      {items.map((item, index: number) => (
        <SortableColumn
          key={`item-${index}`}
          index={index}
          item={item}
          getItemName={getItemName}
          onEdit={onEdit}
          onRemove={onRemove}
          onEnable={onEnable}
          onAdd={onAdd}
          onColorChange={onColorChange}
          disabled={isDragDisabled}
          isDragDisabled={isDragDisabled}
        />
      ))}
    </div>
  );
});

interface ChartSettingOrderedItemsProps<T extends SortableItem>
  extends SortableColumnFunctions<T> {
  onSortEnd: ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number;
    newIndex: number;
  }) => void;
  items: T[];
  distance: number;
}

export function ChartSettingOrderedItems<T extends SortableItem>({
  onRemove,
  onSortEnd,
  onEdit,
  onAdd,
  onEnable,
  onClick,
  getItemName,
  items,
  onColorChange,
}: ChartSettingOrderedItemsProps<T>) {
  return (
    <SortableColumnList
      helperClass="dragging"
      items={items}
      getItemName={getItemName}
      onEdit={onEdit}
      onRemove={onRemove}
      onAdd={onAdd}
      onEnable={onEnable}
      onClick={onClick}
      onSortEnd={onSortEnd}
      onColorChange={onColorChange}
      distance={5}
    />
  );
}
