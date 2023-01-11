import { updateIn } from "icepick";
import React from "react";
import { t } from "ttag";
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
  value: SortableItem[];
  onShowPopoverWidget: (
    widget: { props: { seriesKey?: string; initialKey?: string } },
    ref: HTMLElement | undefined,
  ) => void;
  onSetCurrentWidget: (widget: { props: { initialKey?: string } }) => void;
  series: Series;
  hasEditSettings: boolean;
  hasOnEnable: boolean;
  listOfSeries: boolean;
  onChangeSeriesColor: (seriesKey: string, color: string) => void;
}

export const ChartSettingOrderedSimple = ({
  onChange,
  value: orderedItems,
  onShowPopoverWidget,
  onSetCurrentWidget,
  hasEditSettings = true,
  hasOnEnable = true,
  onChangeSeriesColor,
  listOfSeries = true,
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
    console.log(item);
    onShowPopoverWidget(
      {
        props: {
          [listOfSeries ? "seriesKey" : "initialKey"]: item.key,
        },
      },
      ref,
    );
  };

  const handleColorChange = (item: SortableItem, color: string) => {
    onChangeSeriesColor(item.key, color);
  };

  const handleExtra = () => {
    onSetCurrentWidget({
      props: {
        initialKey: "table.columns2",
      },
    });
  };

  return (
    <ChartSettingOrderedSimpleRoot>
      {orderedItems.length > 0 ? (
        <>
          <p onClick={handleExtra}>Add some stuff</p>
          <ChartSettingOrderedItems
            items={orderedItems}
            getItemName={getItemTitle}
            onRemove={hasOnEnable ? toggleDisplay : undefined}
            onEnable={hasOnEnable ? toggleDisplay : undefined}
            onSortEnd={handleSortEnd}
            onEdit={hasEditSettings ? handleOnEdit : undefined}
            onColorChange={handleColorChange}
            distance={5}
          />
        </>
      ) : (
        <ChartSettingMessage>{t`Nothing to order`}</ChartSettingMessage>
      )}
    </ChartSettingOrderedSimpleRoot>
  );
};
