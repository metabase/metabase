import { arrayMove } from "@dnd-kit/sortable";
import { updateIn } from "icepick";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { DragEndEvent } from "metabase/core/components/Sortable";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isEmpty } from "metabase/lib/validate";
import { Button, Select } from "metabase/ui";
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

interface ChartSettingSeriesOrderProps {
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

export const ChartSettingSeriesOrder = ({
  onChange,
  value: orderedItems,
  onShowWidget,
  hasEditSettings = true,
  onChangeSeriesColor,
}: ChartSettingSeriesOrderProps) => {
  const [isSeriesPickerVisible, setSeriesPickerVisible] = useState(false);

  const [visibleItems, hiddenItems] = useMemo(
    () => _.partition(orderedItems, item => item.enabled),
    [orderedItems],
  );

  const canAddSeries = hiddenItems.length > 0;

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

  const handleAddSeries = useCallback(
    (seriesKey: string) => {
      const item = hiddenItems.find(item => item.key === seriesKey);
      if (item) {
        toggleDisplay(item);
        setSeriesPickerVisible(false);
      }
    },
    [hiddenItems, toggleDisplay],
  );

  const getId = useCallback((item: SortableItem) => item.key, []);

  return (
    <ChartSettingOrderedSimpleRoot>
      {orderedItems.length > 0 ? (
        <>
          <ChartSettingOrderedItems
            items={visibleItems}
            getItemName={getItemTitle}
            onRemove={visibleItems.length > 1 ? toggleDisplay : undefined}
            onEnable={toggleDisplay}
            onSortEnd={handleSortEnd}
            onEdit={hasEditSettings ? handleOnEdit : undefined}
            onColorChange={handleColorChange}
            getId={getId}
            removeIcon="close"
          />
          {canAddSeries && !isSeriesPickerVisible && (
            <Button
              variant="subtle"
              onClick={() => setSeriesPickerVisible(true)}
            >{t`Add another series`}</Button>
          )}
          {isSeriesPickerVisible && (
            <Select
              initiallyOpened
              searchable
              placeholder={t`Select a series`}
              data={hiddenItems.map(item => ({
                value: item.key,
                label: getItemTitle(item),
              }))}
              onChange={handleAddSeries}
              onDropdownClose={() => setSeriesPickerVisible(false)}
              styles={{
                input: {
                  height: "42px",
                  borderRadius: "8px",
                  fontWeight: "bold",
                  "::placeholder": {
                    color: "var(--mb-color-text-medium)",
                  },
                },
              }}
            />
          )}
        </>
      ) : (
        <ChartSettingMessage>{t`Nothing to order`}</ChartSettingMessage>
      )}
    </ChartSettingOrderedSimpleRoot>
  );
};
