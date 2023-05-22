import { updateIn } from "icepick";
import React from "react";
import { t } from "ttag";

import type { Series } from "metabase-types/api";

import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";
import {
  ChartSettingMessage,
  ChartSettingOrderedSimpleRoot,
} from "./ChartSettingOrderedSimple.styled";

interface SortableItem {
  key: string;
  enabled: boolean;
  name: string;
  color?: string;
}

interface ChartSettingOrderedSimpleProps {
  onChange: (rows: SortableItem[]) => void;
  value: SortableItem[];
  onShowWidget: (
    widget: { props: { seriesKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
  series: Series;
  hasEditSettings: boolean;
  onChangeSeriesColor: (seriesKey: string, color: string) => void;
}

export const ChartSettingOrderedSimple = ({
  onChange,
  value: orderedItems,
  onShowWidget,
  hasEditSettings = true,
  onChangeSeriesColor,
}: ChartSettingOrderedSimpleProps) => {
  const toggleDisplay = (selectedItem: SortableItem) => {
    const index = orderedItems.findIndex(item => item.key === selectedItem.key);
    onChange(updateIn(orderedItems, [index, "enabled"], enabled => !enabled));
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
    return item.name || "Unknown";
  };

  const handleOnEdit = (item: SortableItem, ref: HTMLElement | undefined) => {
    onShowWidget(
      {
        props: {
          seriesKey: item.key,
        },
      },
      ref,
    );
  };

  const handleColorChange = (item: SortableItem, color: string) => {
    onChangeSeriesColor(item.key, color);
  };

  return (
    <ChartSettingOrderedSimpleRoot>
      {orderedItems.length > 0 ? (
        <ChartSettingOrderedItems
          items={orderedItems}
          getItemName={getItemTitle}
          onRemove={toggleDisplay}
          onEnable={toggleDisplay}
          onSortEnd={handleSortEnd}
          onEdit={hasEditSettings ? handleOnEdit : undefined}
          onColorChange={handleColorChange}
          distance={5}
        />
      ) : (
        <ChartSettingMessage>{t`Nothing to order`}</ChartSettingMessage>
      )}
    </ChartSettingOrderedSimpleRoot>
  );
};
