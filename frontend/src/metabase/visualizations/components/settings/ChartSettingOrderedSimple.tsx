import { arrayMove } from "@dnd-kit/sortable";
import { updateIn } from "icepick";
import { useCallback } from "react";
import { t } from "ttag";

import type { DragEndEvent } from "metabase/core/components/Sortable";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isEmpty } from "metabase/lib/validate";
import { Box } from "metabase/ui";
import type { Series } from "metabase-types/api";

import { ChartSettingMessage } from "./ChartSettingMessage";
import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";

interface SortableItem {
  key: string;
  enabled: boolean;
  name: string;
  color?: string;
  // Note: when providing the `orderedItems` prop, hidden items should be put at
  // the end of the list to ensure non-hidden items are ordered correctly when
  // moving them.
  hidden?: boolean;
  isOther?: boolean;
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
  onSortEnd: (newItems: SortableItem[]) => void;
}

export const ChartSettingOrderedSimple = ({
  onChange,
  value: orderedItems,
  onShowWidget,
  hasEditSettings = true,
  onChangeSeriesColor,
  onSortEnd,
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

      if (onSortEnd != null) {
        onSortEnd(arrayMove(orderedItems, oldIndex, newIndex));
      } else {
        onChange(arrayMove(orderedItems, oldIndex, newIndex));
      }
    },
    [orderedItems, onChange, onSortEnd],
  );

  const getItemTitle = useCallback((item: SortableItem) => {
    if (isEmpty(item.name)) {
      return NULL_DISPLAY_VALUE;
    }

    return item.name;
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

  const nonHiddenItems = orderedItems.filter(item => !item.hidden);

  return (
    <Box pl="md" pb="sm">
      {orderedItems.length > 0 ? (
        <ChartSettingOrderedItems
          items={nonHiddenItems}
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
    </Box>
  );
};
