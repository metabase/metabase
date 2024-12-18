import { arrayMove } from "@dnd-kit/sortable";
import { updateIn } from "icepick";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorSelector } from "metabase/core/components/ColorSelector";
import type { DragEndEvent } from "metabase/core/components/Sortable";
import { color } from "metabase/lib/colors";
import { getAccentColors } from "metabase/lib/colors/groups";
import type { AccentColorOptions } from "metabase/lib/colors/types";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { getEventTarget } from "metabase/lib/dom";
import { isEmpty } from "metabase/lib/validate";
import { Button, Flex, Group, Icon, Select, Text } from "metabase/ui";
import type { Series } from "metabase-types/api";

import {
  ChartSettingOrderedItems,
  type SortableItem as SortableChartSettingOrderedItem,
} from "./ChartSettingOrderedItems";
import {
  ChartSettingMessage,
  ChartSettingOrderedSimpleRoot,
} from "./ChartSettingOrderedSimple.styled";

export { SortableChartSettingOrderedItem };

export interface SortableItem {
  key: string;
  enabled: boolean;
  name: string;
  color?: string;
  hidden?: boolean;
  hideSettings?: boolean;
}

interface ChartSettingSeriesOrderProps {
  onChange: (rows: SortableItem[]) => void;
  value: SortableItem[];
  onShowWidget: (
    widget: { id?: string; props?: { seriesKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
  series: Series;
  hasEditSettings: boolean;
  onChangeSeriesColor: (seriesKey: string, color: string) => void;
  onSortEnd: (newItems: SortableItem[]) => void;
  accentColorOptions?: AccentColorOptions;
  getItemColor?: (item: SortableChartSettingOrderedItem) => string | undefined;
  addButtonLabel?: string;
  searchPickerPlaceholder?: string;
  groupedAfterIndex?: number;
  otherColor?: string;
  otherSettingWidgetId?: string;
  onOtherColorChange?: (newColor: string) => void;
  truncateAfter?: number;
}

export const ChartSettingSeriesOrder = ({
  onChange,
  value: orderedItems = [],
  addButtonLabel = t`Add another series`,
  searchPickerPlaceholder = t`Select a series`,
  onShowWidget,
  hasEditSettings = true,
  onChangeSeriesColor,
  onSortEnd,
  getItemColor,
  accentColorOptions,
  otherColor,
  groupedAfterIndex = Infinity,
  otherSettingWidgetId,
  truncateAfter = Infinity,
  onOtherColorChange,
}: ChartSettingSeriesOrderProps) => {
  const [isListTruncated, setIsListTruncated] = useState<boolean>(true);
  const [isSeriesPickerVisible, setSeriesPickerVisible] = useState(false);

  const [items, hiddenItems] = useMemo(
    () =>
      _.partition(
        orderedItems.filter(item => !item.hidden),
        item => item.enabled,
      ),
    [orderedItems],
  );
  const itemsAfterGrouping = useMemo(() => {
    return items.map((item, index) => {
      if (index < groupedAfterIndex) {
        return item;
      }
      return {
        ...item,
        color: undefined,
        hideSettings: true,
      };
    });
  }, [groupedAfterIndex, items]);

  const [visibleItems, truncatedItems] = useMemo(
    () =>
      _.partition(
        itemsAfterGrouping,
        (_item, index) => !isListTruncated || index < truncateAfter,
      ),
    [isListTruncated, itemsAfterGrouping, truncateAfter],
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

      if (onSortEnd != null) {
        onSortEnd(arrayMove(orderedItems, oldIndex, newIndex));
      } else {
        onChange(arrayMove(orderedItems, oldIndex, newIndex));
      }
    },
    [orderedItems, onChange, onSortEnd],
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

  const handleOtherSeriesSettingsClick = useCallback(
    (e: React.MouseEvent) => {
      onShowWidget({ id: otherSettingWidgetId }, getEventTarget(e));
    },
    [onShowWidget, otherSettingWidgetId],
  );

  const dividers = useMemo(() => {
    return [
      {
        afterIndex: groupedAfterIndex,
        renderFn: () => (
          <Flex justify="space-between" px={4}>
            <Group p={4} spacing="sm">
              <ColorSelector
                value={otherColor ?? color("text-light")}
                colors={getAccentColors()}
                onChange={onOtherColorChange}
                pillSize="small"
              />
              <Text truncate fw="bold">{t`Other`}</Text>
            </Group>
            <Button
              compact
              color="text-medium"
              variant="subtle"
              leftIcon={<Icon name="gear" />}
              aria-label={t`Other series settings`}
              onClick={handleOtherSeriesSettingsClick}
            />
          </Flex>
        ),
      },
    ];
  }, [
    groupedAfterIndex,
    handleOtherSeriesSettingsClick,
    onOtherColorChange,
    otherColor,
  ]);

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
            accentColorOptions={accentColorOptions}
            getItemColor={getItemColor}
            dividers={dividers}
          />
          {truncatedItems.length > 0 ? (
            <div>
              <Button
                variant="subtle"
                onClick={() => setIsListTruncated(false)}
              >
                {t`${truncatedItems.length} more series`}
              </Button>
            </div>
          ) : null}
          {canAddSeries && !isSeriesPickerVisible && (
            <Button
              variant="subtle"
              onClick={() => setSeriesPickerVisible(true)}
            >
              {addButtonLabel}
            </Button>
          )}
          {isSeriesPickerVisible && (
            <Select
              initiallyOpened
              searchable
              placeholder={searchPickerPlaceholder}
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
