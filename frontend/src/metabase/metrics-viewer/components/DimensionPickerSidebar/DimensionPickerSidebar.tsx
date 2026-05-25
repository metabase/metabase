import { useMemo, useState } from "react";
import { t } from "ttag";

import { trackMetricsViewerDimensionSelected } from "metabase/metrics-viewer/analytics";
import type {
  MetricSourceId,
  MetricsViewerDimensionBreakoutState,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import {
  type AvailableDimensionsResult,
  type DimensionBreakoutInfo,
  type DimensionPickerItem,
  type DimensionPickerSidebarCategory,
  type SourceDisplayInfo,
  buildDimensionPickerSections,
  buildDimensionPickerSidebarCategories,
  getDimensionBreakoutConfig,
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
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
  availableDimensions: AvailableDimensionsResult;
  allFieldsAvailableDimensions?: AvailableDimensionsResult;
  metricSlots: MetricSlot[];
  sourceColors: SourceColorMap;
  metricSourceOrder: MetricSourceId[];
  metricSourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  onSelectDimensionBreakout: (
    dimensionBreakoutInfo: DimensionBreakoutInfo,
  ) => void;
  onUpdateActiveDimensionBreakout: (
    updates: Partial<MetricsViewerDimensionBreakoutState>,
  ) => void;
};

type SidebarMode = "default" | "all";

export function DimensionPickerSidebar({
  activeDimensionBreakout,
  availableDimensions,
  allFieldsAvailableDimensions = availableDimensions,
  metricSlots,
  sourceColors,
  metricSourceOrder,
  metricSourceDataById,
  onSelectDimensionBreakout,
  onUpdateActiveDimensionBreakout,
}: DimensionPickerSidebarProps) {
  const { close } = useDimensionPickerSidebar();
  const [searchText, setSearchText] = useState("");
  const [mode, setMode] = useState<SidebarMode>("default");
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(
    null,
  );

  const categories = useMemo(
    () =>
      buildDimensionPickerSidebarCategories({
        availableDimensions,
        sourceOrder: metricSourceOrder,
        sourceDataById: metricSourceDataById,
      }),
    [availableDimensions, metricSourceOrder, metricSourceDataById],
  );

  const sections = useMemo(
    () =>
      buildDimensionPickerSections({
        availableDimensions: allFieldsAvailableDimensions,
        sourceOrder: metricSourceOrder,
        sourceDataById: metricSourceDataById,
      }),
    [allFieldsAvailableDimensions, metricSourceOrder, metricSourceDataById],
  );

  const filteredSections = useMemo(
    () => filterSections(sections, searchText),
    [sections, searchText],
  );

  const selectedDimensionBreakoutCategoryKey = getSelectedCategoryKey(
    categories,
    activeDimensionBreakout,
  );
  const showAllFields = mode === "all" || searchText.trim() !== "";

  const handleSelect = (item: DimensionPickerItem) => {
    if (hasSameDimensions(item, activeDimensionBreakout)) {
      return;
    }

    const dimensionBreakoutConfig = getDimensionBreakoutConfig(
      item.dimensionBreakoutInfo.type,
    );
    if (
      activeDimensionBreakout.type === item.dimensionBreakoutInfo.type &&
      dimensionBreakoutConfig.matchMode === "aggregate"
    ) {
      onUpdateActiveDimensionBreakout({
        dimensionMapping: item.dimensionBreakoutInfo.dimensionMapping,
        label: item.dimensionBreakoutInfo.label,
      });
      trackMetricsViewerDimensionSelected();
      return;
    }

    onSelectDimensionBreakout(item.dimensionBreakoutInfo);
    trackMetricsViewerDimensionSelected();
  };

  const handleCategorySelect = (category: DimensionPickerSidebarCategory) => {
    if (expandedCategoryKey !== category.key) {
      setExpandedCategoryKey(null);
    }

    if (isCategorySelected(category, activeDimensionBreakout)) {
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
    const isActiveCategory = isCategorySelected(
      category,
      activeDimensionBreakout,
    );

    if (isActiveCategory) {
      const dimensionMapping = {
        ...activeDimensionBreakout.dimensionMapping,
        [slotIndex]: dimensionId,
      };
      onUpdateActiveDimensionBreakout({ dimensionMapping });
      return;
    }

    const dimensionMapping = {
      ...category.dimensionBreakoutInfo.dimensionMapping,
      [slotIndex]: dimensionId,
    };
    onSelectDimensionBreakout({
      ...category.dimensionBreakoutInfo,
      dimensionMapping,
    });
    trackMetricsViewerDimensionSelected();
  };

  const handleBack = () => {
    setMode("default");
    setSearchText("");
  };

  const handleSeeAll = () => {
    setMode("all");
  };

  const showFieldsByCategory = !showAllFields && categories.length > 0;

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
        {showAllFields && (
          <AllFieldsList
            activeDimensionBreakout={activeDimensionBreakout}
            sections={filteredSections}
            metricSourceOrder={metricSourceOrder}
            metricSourceDataById={metricSourceDataById}
            sourceColors={sourceColors}
            metricSlots={metricSlots}
            onSelect={handleSelect}
          />
        )}
        {showFieldsByCategory && (
          <Stack gap="xs">
            <Text px="sm" size="sm" c="text-secondary" my="sm">
              {t`Shared dimensions`}
            </Text>
            <Stack gap="xs">
              {categories.map((category) => {
                const isSelected =
                  category.key === selectedDimensionBreakoutCategoryKey;
                const isExpanded = category.key === expandedCategoryKey;

                return (
                  <CategoryItem
                    key={category.key}
                    category={category}
                    activeDimensionBreakout={activeDimensionBreakout}
                    metricSlots={metricSlots}
                    sourceDataById={metricSourceDataById}
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
        )}
        {!showAllFields && !showFieldsByCategory && (
          <Text c="text-secondary" ta="center" py="lg">
            {t`No fields found`}
          </Text>
        )}
      </ScrollArea>
    </Box>
  );
}
