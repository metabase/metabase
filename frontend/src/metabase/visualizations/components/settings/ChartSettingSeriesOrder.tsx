import { arrayMove } from "@dnd-kit/sortable";
import { updateIn } from "icepick";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorSelector } from "metabase/common/components/ColorSelector";
import type { DragEndEvent } from "metabase/common/components/Sortable";
import { Box, Button, Flex, Group, Icon, Select, Text } from "metabase/ui";
import { color } from "metabase/ui/colors";
import { getNamedAccentColors } from "metabase/ui/colors/groups";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { getEventTarget } from "metabase/utils/dom";
import { isEmpty } from "metabase/utils/validate";
import type {
  ChartSettingSeriesOrderItem,
  ChartSettingSeriesOrderProps,
} from "metabase/viz-core";

import { ChartSettingMessage } from "./ChartSettingMessage";
import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";

export const ChartSettingSeriesOrder = ({
  onChange,
  value: orderedItems = [],
  addButtonLabel = t`Add another series`,
  searchPickerPlaceholder = t`Select a series`,
  onShowWidget,
  hasEditSettings = true,
  onChangeSeriesColor,
  onSortEnd,
  isSortable = true,
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
        orderedItems.filter((item) => !item.hidden),
        (item) => item.enabled,
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
    (selectedItem: ChartSettingSeriesOrderItem) => {
      const index = orderedItems.findIndex(
        (item) => item.key === selectedItem.key,
      );
      onChange(
        updateIn(orderedItems, [index, "enabled"], (enabled) => !enabled),
      );
    },
    [orderedItems, onChange],
  );

  const handleSortEnd = useCallback(
    ({ id, newIndex }: DragEndEvent) => {
      const oldIndex = orderedItems.findIndex((item) => item.key === id);

      if (onSortEnd != null) {
        onSortEnd(arrayMove(orderedItems, oldIndex, newIndex));
      } else {
        onChange(arrayMove(orderedItems, oldIndex, newIndex));
      }
    },
    [orderedItems, onChange, onSortEnd],
  );

  const getItemTitle = useCallback((item: ChartSettingSeriesOrderItem) => {
    return isEmpty(item.name) ? NULL_DISPLAY_VALUE : item.name;
  }, []);

  const handleOnEdit = useCallback(
    (item: ChartSettingSeriesOrderItem, ref: HTMLElement | undefined) => {
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
    (item: ChartSettingSeriesOrderItem, color: string, colorName?: string) => {
      onChangeSeriesColor(item.key, color, colorName);
    },
    [onChangeSeriesColor],
  );

  const handleAddSeries = useCallback(
    (seriesKey: string | null) => {
      const item = hiddenItems.find((item) => item.key === seriesKey);
      if (item) {
        toggleDisplay(item);
        setSeriesPickerVisible(false);
      }
    },
    [hiddenItems, toggleDisplay],
  );

  const getId = useCallback(
    (item: ChartSettingSeriesOrderItem) => item.key,
    [],
  );

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
            <Group p={4} gap="sm">
              <ColorSelector
                value={otherColor ?? color("text-disabled")}
                colors={getNamedAccentColors()}
                onChange={onOtherColorChange}
                pillSize="small"
              />
              <Text truncate fw="bold">{t`Other`}</Text>
            </Group>
            <Button
              size="compact-md"
              color="text-secondary"
              variant="subtle"
              leftSection={<Icon name="gear" />}
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
    <Box pl="lg" pb="sm">
      {orderedItems.length > 0 ? (
        <>
          <ChartSettingOrderedItems
            items={visibleItems}
            getItemName={getItemTitle}
            onRemove={visibleItems.length > 1 ? toggleDisplay : undefined}
            onEnable={toggleDisplay}
            onSortEnd={handleSortEnd}
            isSortable={isSortable}
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
              dropdownOpened
              searchable
              placeholder={searchPickerPlaceholder}
              data={hiddenItems.map((item) => ({
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
                    color: "var(--mb-color-text-secondary)",
                  },
                },
              }}
            />
          )}
        </>
      ) : (
        <ChartSettingMessage>{t`Nothing to order`}</ChartSettingMessage>
      )}
    </Box>
  );
};
