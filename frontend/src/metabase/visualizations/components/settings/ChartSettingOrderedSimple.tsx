import { arrayMove } from "@dnd-kit/sortable";
import { updateIn } from "icepick";
import { useCallback } from "react";
import { t } from "ttag";

import type { DragEndEvent } from "metabase/core/components/Sortable";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isEmpty } from "metabase/lib/validate";
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
  const toggleDisplay = useCallback(
    (selectedItem: SortableItem) => {
      const index = orderedItems.findIndex(
        item => item.key === selectedItem.key,
      );
      onChange(updateIn(orderedItems, [index, "enabled"], enabled => !enabled));
    },
    [orderedItems, onChange],
  );

  const handleSortEnd = useCallback(
    ({ id, newIndex }: DragEndEvent) => {
      const oldIndex = orderedItems.findIndex(item => item.key === id);
      onChange(arrayMove(orderedItems, oldIndex, newIndex));
    },
    [orderedItems, onChange],
  );

  const getItemTitle = useCallback((item: SortableItem) => {
    return isEmpty(item.name) ? NULL_DISPLAY_VALUE : item.name;
  }, []);

  const handleOnEdit = useCallback(
    (item: SortableItem, ref: HTMLElement | undefined) => {
      onShowWidget(
        {
          props: {
            seriesKey: item.key,
          },
        },
        ref,
      );
    },
    [onShowWidget],
  );

  const handleColorChange = useCallback(
    (item: SortableItem, color: string) => {
      onChangeSeriesColor(item.key, color);
    },
    [onChangeSeriesColor],
  );

  const getId = useCallback((item: SortableItem) => item.key, []);

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
          getId={getId}
        />
      ) : (
        <ChartSettingMessage>{t`Nothing to order`}</ChartSettingMessage>
      )}
    </ChartSettingOrderedSimpleRoot>
  );
};
