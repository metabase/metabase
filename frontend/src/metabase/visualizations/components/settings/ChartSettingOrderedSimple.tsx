import { updateIn } from "icepick";
import React from "react";
import { t } from "ttag";

import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";

import {
  ChartSettingMessage,
  ChartSettingOrderedSimpleRoot,
} from "./ChartSettingOrderedSimple.styled";

interface SortableItem {
  enabled: boolean;
  originalIndex: number;
  name: string;
}

interface ChartSettingOrderedSimpleProps {
  onChange: (rows: SortableItem[]) => void;
  items: SortableItem[];
  value: SortableItem[];
}

export const ChartSettingOrderedSimple = ({
  onChange,
  items,
  value: orderedItems,
}: ChartSettingOrderedSimpleProps) => {
  const handleDisable = (item: SortableItem) => {
    const index = orderedItems.findIndex(
      r => r.originalIndex === item.originalIndex,
    );
    onChange(
      updateIn(orderedItems, [index], item => ({
        ...item,
        enabled: !item.enabled,
      })),
    );
  };

  const handleSortEnd = ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number;
    newIndex: number;
  }) => {
    const itemsCopy = [...orderedItems];
    itemsCopy.splice(newIndex, 0, itemsCopy.splice(oldIndex, 1)[0]);
    onChange(itemsCopy);
  };

  const getItemTitle = (item: SortableItem) => {
    return items[item.originalIndex]?.name || "Unknown";
  };

  return (
    <ChartSettingOrderedSimpleRoot>
      {orderedItems.length > 0 ? (
        <ChartSettingOrderedItems
          items={orderedItems}
          getItemName={getItemTitle}
          onRemove={handleDisable}
          onEnable={handleDisable}
          onSortEnd={handleSortEnd}
          distance={5}
        />
      ) : (
        <ChartSettingMessage>{t`Nothing to order`}</ChartSettingMessage>
      )}
    </ChartSettingOrderedSimpleRoot>
  );
};
