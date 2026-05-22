import type {
  MetricSourceId,
  MetricsViewerTabState,
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

export function CategoryItem({
  category,
  activeTab,
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
  activeTab: MetricsViewerTabState;
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
    activeTab,
    metricSlots,
    sourceDataById,
    sourceColors,
  });

  return (
    <Box>
      <CategoryButton
        item={category}
        isSelected={isSelected}
        canConfigure={categorySelectRows.length > 0}
        isExpanded={isExpanded}
        onClick={onCategorySelect}
        onConfigure={onToggleCategorySettings}
      />
      {isExpanded && categorySelectRows.length > 0 && (
        <Stack className={S.categorySelectList} gap="xs">
          {categorySelectRows.map((row) => (
            <MetricDimensionSelect
              key={row.slotIndex}
              row={row}
              onChange={(dimensionId) =>
                onDimensionChange(row.slotIndex, dimensionId)
              }
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function getCategorySelectRows({
  category,
  activeTab,
  metricSlots,
  sourceDataById,
  sourceColors,
}: {
  category: DimensionPickerSidebarCategory;
  activeTab: MetricsViewerTabState;
  metricSlots: MetricSlot[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  sourceColors: SourceColorMap;
}) {
  const categoryTab = isCategorySelected(category, activeTab)
    ? activeTab
    : {
        ...activeTab,
        type: category.tabInfo.type,
        label: category.tabInfo.label,
        dimensionMapping: category.tabInfo.dimensionMapping,
      };

  return buildDimensionPickerSidebarCategorySelectRows({
    category,
    activeTab: categoryTab,
    metricSlots,
    sourceDataById,
    sourceColors,
  });
}
