import { useMemo, useState } from "react";
import { t } from "ttag";

import { trackMetricsViewerDimensionTabAdded } from "metabase/metrics-viewer/analytics";
import type {
  MetricSourceId,
  MetricsViewerTabState,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import {
  type AvailableDimensionsResult,
  type DimensionPickerItem,
  type DimensionPickerSidebarCategory,
  type SourceDisplayInfo,
  type TabInfo,
  buildDimensionPickerSections,
  buildDimensionPickerSidebarCategories,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

import S from "./DimensionPickerSidebar.module.css";
import { useDimensionPickerSidebar } from "./DimensionPickerSidebarContext";
import { AllFieldsList } from "./components/AllFieldsList";
import { CategoryItem } from "./components/CategoryItem";
import {
  filterSections,
  getSelectedCategoryKey,
  hasSameDimensions,
  isCategorySelected,
} from "./utils";

type DimensionPickerSidebarProps = {
  activeTab: MetricsViewerTabState;
  availableDimensions: AvailableDimensionsResult;
  allFieldsAvailableDimensions?: AvailableDimensionsResult;
  metricSlots: MetricSlot[];
  sourceColors: SourceColorMap;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
  onAddTab: (tabInfo: TabInfo) => void;
  onUpdateActiveTab: (updates: Partial<MetricsViewerTabState>) => void;
};

type SidebarMode = "default" | "all";

export function DimensionPickerSidebar({
  activeTab,
  availableDimensions,
  allFieldsAvailableDimensions = availableDimensions,
  metricSlots,
  sourceColors,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
  onAddTab,
  onUpdateActiveTab,
}: DimensionPickerSidebarProps) {
  const { close } = useDimensionPickerSidebar();
  const [searchText, setSearchText] = useState("");
  const [mode, setMode] = useState<SidebarMode>("default");
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(
    null,
  );
  const [expandedMetricSourceIds, setExpandedMetricSourceIds] = useState<
    MetricSourceId[]
  >(() => sourceOrder.slice(0, 1));

  const sections = useMemo(
    () =>
      buildDimensionPickerSections({
        availableDimensions: allFieldsAvailableDimensions,
        sourceOrder,
        sourceDataById,
        hasMultipleSources,
      }),
    [
      allFieldsAvailableDimensions,
      sourceOrder,
      sourceDataById,
      hasMultipleSources,
    ],
  );

  const categories = useMemo(
    () =>
      buildDimensionPickerSidebarCategories({
        availableDimensions,
        sourceOrder,
        sourceDataById,
        hasMultipleSources,
      }),
    [availableDimensions, sourceOrder, sourceDataById, hasMultipleSources],
  );

  const filteredSections = useMemo(
    () => filterSections(sections, searchText),
    [sections, searchText],
  );

  const selectedTabCategoryKey = getSelectedCategoryKey(categories, activeTab);
  const showAllFields = mode === "all" || searchText.trim() !== "";

  const handleSelect = (item: DimensionPickerItem) => {
    if (hasSameDimensions(item, activeTab)) {
      return;
    }

    onAddTab(item.tabInfo);
    trackMetricsViewerDimensionTabAdded();
  };

  const handleCategorySelect = (category: DimensionPickerSidebarCategory) => {
    if (expandedCategoryKey !== category.key) {
      setExpandedCategoryKey(null);
    }

    if (isCategorySelected(category, activeTab)) {
      return;
    }

    handleSelect(category);
  };

  const handleToggleCategorySettings = (
    category: DimensionPickerSidebarCategory,
  ) => {
    setExpandedCategoryKey((currentKey) =>
      currentKey === category.key ? null : category.key,
    );
  };

  const handleCategoryDimensionChange = (
    category: DimensionPickerSidebarCategory,
    slotIndex: number,
    dimensionId: string,
  ) => {
    const isActiveCategory = isCategorySelected(category, activeTab);

    if (isActiveCategory) {
      const dimensionMapping = {
        ...activeTab.dimensionMapping,
        [slotIndex]: dimensionId,
      };
      onUpdateActiveTab({ dimensionMapping });
      return;
    }

    const dimensionMapping = {
      ...category.tabInfo.dimensionMapping,
      [slotIndex]: dimensionId,
    };
    onAddTab({
      ...category.tabInfo,
      dimensionMapping,
    });
    trackMetricsViewerDimensionTabAdded();
  };

  const handleBack = () => {
    setMode("default");
    setSearchText("");
  };

  const handleSeeAll = () => {
    setMode("all");
  };

  const handleToggleMetric = (sourceId: MetricSourceId) => {
    setExpandedMetricSourceIds((currentSourceIds) => {
      if (currentSourceIds.includes(sourceId)) {
        return currentSourceIds.filter(
          (currentSourceId) => currentSourceId !== sourceId,
        );
      }

      return [...currentSourceIds, sourceId];
    });
  };

  return (
    <Box
      className={S.root}
      component="aside"
      data-testid="metrics-viewer-dimension-picker-sidebar"
      pl="lg"
    >
      <Flex align="center" justify="space-between" pt="xs" pb="md">
        <Flex align="center" gap="sm" miw={0}>
          {showAllFields && (
            <ActionIcon
              aria-label={t`Back`}
              variant="subtle"
              onClick={handleBack}
            >
              <Icon name="arrow_left" />
            </ActionIcon>
          )}
          <Title order={3} size="h4" fw="bold">
            {showAllFields ? t`All fields` : t`Group by`}
          </Title>
        </Flex>
        <ActionIcon aria-label={t`Close`} variant="subtle" onClick={close}>
          <Icon name="close" />
        </ActionIcon>
      </Flex>

      <Box pb="md">
        <TextInput
          aria-label={t`Search fields`}
          classNames={{ input: S.searchInput }}
          leftSection={<Icon name="search" size={14} />}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          placeholder={t`Search fields`}
          size="sm"
          value={searchText}
        />
      </Box>

      <ScrollArea pb="lg" offsetScrollbars="present">
        {showAllFields ? (
          <AllFieldsList
            activeTab={activeTab}
            sections={filteredSections}
            sourceOrder={sourceOrder}
            sourceDataById={sourceDataById}
            sourceColors={sourceColors}
            metricSlots={metricSlots}
            hasMultipleSources={hasMultipleSources}
            expandedMetricSourceIds={expandedMetricSourceIds}
            onToggleMetric={handleToggleMetric}
            onSelect={handleSelect}
          />
        ) : categories.length > 0 ? (
          <Stack gap="lg">
            <Stack gap="xs">
              <Text px="sm" size="sm" c="text-secondary" my="sm">
                {t`Shared dimensions`}
              </Text>
              <Stack gap="xs">
                {categories.map((category) => {
                  const isSelected = category.key === selectedTabCategoryKey;
                  const isExpanded = category.key === expandedCategoryKey;

                  return (
                    <CategoryItem
                      key={category.key}
                      category={category}
                      activeTab={activeTab}
                      metricSlots={metricSlots}
                      sourceDataById={sourceDataById}
                      sourceColors={sourceColors}
                      isSelected={isSelected}
                      isExpanded={isExpanded}
                      onCategorySelect={() => handleCategorySelect(category)}
                      onToggleCategorySettings={() =>
                        handleToggleCategorySettings(category)
                      }
                      onDimensionChange={(slotIndex, dimensionId) =>
                        handleCategoryDimensionChange(
                          category,
                          slotIndex,
                          dimensionId,
                        )
                      }
                    />
                  );
                })}
                <Button
                  mr="auto"
                  mt="sm"
                  onClick={handleSeeAll}
                  size="sm"
                  variant="subtle"
                >
                  {t`See all`}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        ) : (
          <Text
            c="text-secondary"
            ta="center"
            py="lg"
          >{t`No fields found`}</Text>
        )}
      </ScrollArea>
    </Box>
  );
}
