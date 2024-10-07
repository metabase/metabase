import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useCallback } from "react";

import type { DragEndEvent } from "metabase/core/components/Sortable";
import { Sortable, SortableList } from "metabase/core/components/Sortable";
import type { AccentColorOptions } from "metabase/lib/colors/types";
import type { IconProps } from "metabase/ui";

import { ColumnItem } from "../ColumnItem";

export interface SortableItem {
  enabled: boolean;
  color?: string;
  icon?: IconProps["name"];
  isOther?: boolean;
}

interface SortableColumnFunctions<T> {
  onRemove?: (item: T) => void;
  onEdit?: (item: T, targetElement: HTMLElement) => void;
  onClick?: (item: T) => void;
  onAdd?: (item: T) => void;
  onEnable?: (item: T) => void;
  getItemName: (item: T) => string;
  onColorChange?: (item: T, color: string) => void;
}
interface ChartSettingOrderedItemsProps<T extends SortableItem>
  extends SortableColumnFunctions<T> {
  onSortEnd: ({ id, newIndex }: DragEndEvent) => void;
  items: T[];
  getId: (item: T) => string | number;
  removeIcon?: IconProps["name"];
  accentColorOptions?: AccentColorOptions;
  getItemColor?: (item: SortableItem) => string | undefined;
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
  getId,
  removeIcon,
  accentColorOptions,
  getItemColor = item => item.color,
}: ChartSettingOrderedItemsProps<T>) {
  const isDragDisabled = items.length < 1;
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const renderItem = useCallback(
    ({ item, id }: { item: T; id: string | number }) =>
      !item.isOther ? (
        <Sortable
          id={id}
          key={`sortable-${id}`}
          disabled={isDragDisabled}
          draggingStyle={{ opacity: 0.5 }}
        >
          <ColumnItem
            title={getItemName(item)}
            onEdit={
              onEdit
                ? (targetElement: HTMLElement) => onEdit(item, targetElement)
                : undefined
            }
            onRemove={
              onRemove && item.enabled ? () => onRemove(item) : undefined
            }
            onClick={onClick ? () => onClick(item) : undefined}
            onAdd={onAdd ? () => onAdd(item) : undefined}
            onEnable={
              onEnable && !item.enabled ? () => onEnable(item) : undefined
            }
            onColorChange={
              onColorChange
                ? (color: string) => onColorChange(item, color)
                : undefined
            }
            color={getItemColor(item)}
            draggable={!isDragDisabled}
            icon={item.icon}
            removeIcon={removeIcon}
            role="listitem"
            accentColorOptions={accentColorOptions}
          />
        </Sortable>
      ) : null,
    [
      isDragDisabled,
      removeIcon,
      getItemName,
      onEdit,
      onRemove,
      onClick,
      onAdd,
      onEnable,
      onColorChange,
      accentColorOptions,
      getItemColor,
    ],
  );

  return (
    <SortableList
      getId={getId}
      renderItem={renderItem}
      items={items}
      onSortEnd={onSortEnd}
      sensors={[pointerSensor]}
    />
  );
}
