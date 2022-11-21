import { updateIn } from "icepick";
import React from "react";
import { t } from "ttag";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { findSeriesByKey } from "metabase/visualizations/lib/series";
import { Series } from "metabase-types/types/Visualization";

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
  items: SortableItem[];
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
  items,
  value: orderedItems,
  series,
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
    return items.find(i => i.key === item.key)?.name || "Unknown";
  };

  const handleOnEdit = (item: SortableItem, ref: HTMLElement | undefined) => {
    onShowWidget(
      {
        props: {
          seriesKey: keyForSingleSeries(item.key),
        },
      },
      ref,
    );
  };

  const handleColorChange = (item: SortableItem, color: string) => {
    const singleSeries = findSeriesByKey(series, item.key);
    const seriesKey = keyForSingleSeries(singleSeries);
    onChangeSeriesColor(seriesKey, color);
  };

  return (
    <ChartSettingOrderedSimpleRoot>
      {orderedItems.length > 0 ? (
        <ChartSettingOrderedItems
          items={orderedItems.map(item => ({
            ...item,
            color: items.find(i => i.key === item.key)?.color,
          }))}
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
