import type {
  MetricSourceId,
  MetricsViewerDimensionBreakoutState,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import {
  type DimensionPickerSidebarCategory,
  type SourceDisplayInfo,
  buildDimensionPickerSidebarCategorySelectRows,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";
import { Box, Stack } from "metabase/ui";

import { isCategorySelected } from "../utils";

import { CategoryButton } from "./CategoryButton";
import S from "./CategoryItem.module.css";
import { MetricDimensionSelect } from "./MetricDimensionSelect";
import { SingleMetricDimensionList } from "./SingleMetricDimensionList";

export function CategoryItem({
  category,
  activeDimensionBreakout,
  metricSlots,
  sourceDataById,
  sourceColors,
  isSelected,
  isExpanded,
  onCategorySelect,
  onToggleCategorySettings,
  onDimensionChange,
}: {
  category: DimensionPickerSidebarCategory;
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
  metricSlots: MetricSlot[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  sourceColors: SourceColorMap;
  isSelected: boolean;
  isExpanded: boolean;
  onCategorySelect: () => void;
  onToggleCategorySettings: () => void;
  onDimensionChange: (slotIndex: number, dimensionId: string) => void;
}) {
  const categorySelectRows = getCategorySelectRows({
    category,
    activeDimensionBreakout,
    metricSlots,
    sourceDataById,
    sourceColors,
  });
  const canConfigure =
    categorySelectRows.length > 0 &&
    categorySelectRows.some(
      (row) => row.options.length > 1 || row.isExpressionToken,
    );

  return (
    <Box>
      <CategoryButton
        item={category}
        isSelected={isSelected}
        canConfigure={canConfigure}
        isExpanded={isExpanded}
        onClick={onCategorySelect}
        onConfigure={onToggleCategorySettings}
      />
      {isExpanded && canConfigure && (
        <Stack className={S.categorySelectList} gap="xs">
          {metricSlots.length === 1 ? (
            <SingleMetricDimensionList
              row={categorySelectRows[0]}
              onChange={(dimensionId) =>
                onDimensionChange(categorySelectRows[0].slotIndex, dimensionId)
              }
            />
          ) : (
            categorySelectRows.map((row) => (
              <MetricDimensionSelect
                key={row.slotIndex}
                row={row}
                onChange={(dimensionId) =>
                  onDimensionChange(row.slotIndex, dimensionId)
                }
              />
            ))
          )}
        </Stack>
      )}
    </Box>
  );
}

function getCategorySelectRows({
  category,
  activeDimensionBreakout,
  metricSlots,
  sourceDataById,
  sourceColors,
}: {
  category: DimensionPickerSidebarCategory;
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
  metricSlots: MetricSlot[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  sourceColors: SourceColorMap;
}) {
  const categoryDimensionBreakout = getCategoryDimensionBreakout({
    category,
    activeDimensionBreakout,
  });

  return buildDimensionPickerSidebarCategorySelectRows({
    category,
    activeDimensionBreakout: categoryDimensionBreakout,
    metricSlots,
    sourceDataById,
    sourceColors,
  });
}

function getCategoryDimensionBreakout({
  category,
  activeDimensionBreakout,
}: {
  category: DimensionPickerSidebarCategory;
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
}) {
  if (isCategorySelected(category, activeDimensionBreakout)) {
    return activeDimensionBreakout;
  }

  return {
    ...activeDimensionBreakout,
    type: category.dimensionBreakoutInfo.type,
    label: category.dimensionBreakoutInfo.label,
    dimensionMapping: {},
  };
}
