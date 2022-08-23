import React from "react";

import {
  SortableContainer,
  SortableElement,
} from "metabase/components/sortable";

import ColumnItem from "./ColumnItem";

interface SortableColumnFunctions {
  onRemove?: (item: any) => void;
  onEdit?: (item: any) => void;
  onClick?: (item: any) => void;
  onAdd?: (item: any) => void;
  onEnable?: (item: any) => void;
  getItemName: (item: any) => string;
}

interface SortableColumnProps extends SortableColumnFunctions {
  item: any;
}

const SortableColumn = SortableElement(
  ({
    item,
    getItemName,
    onEdit,
    onRemove,
    onClick,
    onAdd,
    onEnable,
  }: SortableColumnProps) => (
    <ColumnItem
      title={getItemName(item)}
      onEdit={onEdit ? () => onEdit(item) : null}
      onRemove={onRemove && item.enabled ? () => onRemove(item) : null}
      onClick={onClick ? () => onClick(item) : null}
      onAdd={onAdd ? () => onAdd(item) : null}
      onEnable={onEnable && !item.enabled ? () => onEnable(item) : null}
      draggable
    />
  ),
);

interface SortableColumnListProps extends SortableColumnFunctions {
  items: [];
}

const SortableColumnList = SortableContainer(
  ({
    items,
    getItemName,
    onEdit,
    onRemove,
    onEnable,
    onAdd,
  }: SortableColumnListProps) => {
    return (
      <div>
        {items.map((item: any, index: number) => (
          <SortableColumn
            key={`item-${index}`}
            index={index}
            item={item}
            getItemName={getItemName}
            onEdit={onEdit}
            onRemove={onRemove}
            onEnable={onEnable}
            onAdd={onAdd}
          />
        ))}
      </div>
    );
  },
);

interface ChartSettingOrderedItemsProps extends SortableColumnFunctions {
  onSortEnd: ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number;
    newIndex: number;
  }) => void;
  items: any[];
  distance: number;
}

export const ChartSettingOrderedItems = ({
  onRemove,
  onSortEnd,
  onEdit,
  onAdd,
  onEnable,
  onClick,
  getItemName,
  items,
}: ChartSettingOrderedItemsProps) => {
  return (
    <SortableColumnList
      helperClass=""
      items={items}
      getItemName={getItemName}
      onEdit={onEdit}
      onRemove={onRemove}
      onAdd={onAdd}
      onEnable={onEnable}
      onClick={onClick}
      onSortEnd={onSortEnd}
      distance={5}
    />
  );
};
