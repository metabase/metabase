import cx from "classnames";
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
  getComparableDimensionMapping,
  getDimensionBreakoutConfig,
  getScalarDimensionBreakoutLabel,
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
  UnstyledButton,
} from "metabase/ui";

import S from "./DimensionPickerSidebar.module.css";
import { useDimensionPickerSidebar } from "./DimensionPickerSidebarContext";
import { AllFieldsList } from "./components/AllFieldsList";
import { CategoryItem } from "./components/CategoryItem";
import {
  filterSections,
  getSelectedCategoryKey,
  hasMatchingDimensions,
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
        metricSlots,
      }),
    [availableDimensions, metricSourceOrder, metricSourceDataById, metricSlots],
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
  const hasAllFields = sections.length > 0;
  const showSeeAll = !showAllFields && hasAllFields;
  const defaultEmptyStateText = hasMultipleMetricSources(metricSlots)
    ? t`No shared dimensions found`
    : t`No fields found`;
  const defaultSectionHeader = hasMultipleMetricSources(metricSlots)
    ? t`Shared dimensions`
    : t`Dimensions`;

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

  const handleAllFieldsSelect = (item: DimensionPickerItem) => {
    if (isMatchingActiveDimensionBreakout(item, activeDimensionBreakout)) {
      return;
    }

    const dimensionMapping = getComparableDimensionMapping({
      item,
      sections,
      metricSlots,
      activeDimensionBreakout,
    });
    const dimensionBreakoutId = getDimensionBreakoutId(item);
    const dimensionBreakoutConfig = getDimensionBreakoutConfig(
      item.dimensionBreakoutInfo.type,
    );
    if (
      activeDimensionBreakout.type === item.dimensionBreakoutInfo.type &&
      dimensionBreakoutConfig.matchMode === "aggregate"
    ) {
      onUpdateActiveDimensionBreakout({
        dimensionMapping,
        label: item.dimensionBreakoutInfo.label,
      });
      trackMetricsViewerDimensionSelected();
      return;
    }

    onSelectDimensionBreakout({
      ...item.dimensionBreakoutInfo,
      ...(dimensionBreakoutId ? { id: dimensionBreakoutId } : {}),
      dimensionMapping,
    });
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

  const handleNoBreakout = () => {
    if (activeDimensionBreakout.type === "scalar") {
      return;
    }

    onSelectDimensionBreakout({
      type: "scalar",
      label: getScalarDimensionBreakoutLabel(),
      dimensionMapping: {},
    });
    trackMetricsViewerDimensionSelected();
  };

  const showFieldsByCategory = !showAllFields && categories.length > 0;
  const showDefaultView = !showAllFields;
  const isNoBreakoutSelected = activeDimensionBreakout.type === "scalar";

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
            {showAllFields ? t`All fields` : t`Break out by`}
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
            onSelect={handleAllFieldsSelect}
          />
        )}
        {showDefaultView && (
          <Stack gap="xs">
            <Flex align="center" justify="space-between" my="sm">
              <Text size="md" c="text-secondary">
                {defaultSectionHeader}
              </Text>
              {showSeeAll && (
                <Button onClick={handleSeeAll} p={0} size="xs" variant="subtle">
                  {t`See all`}
                </Button>
              )}
            </Flex>
            {showFieldsByCategory ? (
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
              </Stack>
            ) : (
              <Text c="text-secondary" ta="center" py="lg">
                {defaultEmptyStateText}
              </Text>
            )}
            <Box className={S.noBreakoutSection}>
              <UnstyledButton
                className={cx(S.noBreakoutButton, {
                  [S.selected]: isNoBreakoutSelected,
                })}
                aria-label={t`No breakout`}
                aria-pressed={isNoBreakoutSelected}
                onClick={handleNoBreakout}
              >
                <Icon
                  className={S.noBreakoutIcon}
                  name="unreferenced"
                  size={16}
                />
                <Text className={S.noBreakoutLabel} component="span">
                  {t`No breakout`}
                </Text>
              </UnstyledButton>
            </Box>
          </Stack>
        )}
      </ScrollArea>
    </Box>
  );
}

function hasMultipleMetricSources(metricSlots: MetricSlot[]) {
  return new Set(metricSlots.map((slot) => slot.sourceId)).size > 1;
}

function getDimensionBreakoutId(item: DimensionPickerItem) {
  return Object.values(item.dimensionBreakoutInfo.dimensionMapping).find(
    (dimensionId) => dimensionId != null,
  );
}

function isMatchingActiveDimensionBreakout(
  item: DimensionPickerItem,
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState,
) {
  const dimensionBreakoutId = getDimensionBreakoutId(item);

  return (
    hasMatchingDimensions(item, activeDimensionBreakout) &&
    item.dimensionBreakoutInfo.label === activeDimensionBreakout.label &&
    (dimensionBreakoutId == null ||
      dimensionBreakoutId === activeDimensionBreakout.id)
  );
}
