import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { trackMetricsViewerDimensionSelected } from "metabase/metrics-viewer/analytics";
import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type { MetricsViewerDimensionBreakoutState } from "metabase/metrics-viewer/types";
import {
  type DimensionPickerItem,
  type DimensionPickerSidebarCategory,
  getComparableDimensionMapping,
  getDimensionBreakoutConfig,
  getScalarDimensionBreakoutLabel,
} from "metabase/metrics-viewer/utils";
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
import { AllFieldsList } from "./components/AllFieldsList";
import { CategoryItem } from "./components/CategoryItem";
import { useDimensionPickerSidebarCategories } from "./hooks/useDimensionPickerSidebarCategories";
import { useDimensionPickerSidebarSections } from "./hooks/useDimensionPickerSidebarSections";
import {
  filterSections,
  getDimensionBreakoutId,
  getSelectedCategoryKey,
  hasMatchingDimensions,
  hasMultipleMetricSources,
  hasSameDimensions,
  isCategorySelected,
} from "./utils";

type SidebarMode = "default" | "all";

type DimensionPickerSidebarProps = {
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
};

export function DimensionPickerSidebar(props: DimensionPickerSidebarProps) {
  const { activeDimensionBreakout } = props;
  const {
    formulaEntities,
    metricSlots,
    sourceColors,
    sourceDataById,
    selectDimensionBreakout: onSelectDimensionBreakout,
    updateActiveDimensionBreakout,
    closeSidebar,
  } = useMetricsViewerContext();
  const [searchText, setSearchText] = useState("");
  const [mode, setMode] = useState<SidebarMode>("default");
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(
    null,
  );

  const categories = useDimensionPickerSidebarCategories();
  const sections = useDimensionPickerSidebarSections();

  const filteredSections = useMemo(
    () => filterSections(sections, searchText),
    [sections, searchText],
  );

  const selectedDimensionBreakoutCategoryKey = getSelectedCategoryKey(
    categories,
    activeDimensionBreakout,
  );
  const isStandaloneMetric =
    formulaEntities.length === 1 && formulaEntities[0]?.type === "metric";
  const isSearching = searchText.trim() !== "";
  const showAllFields = !isStandaloneMetric && (mode === "all" || isSearching);
  const hasAllFields = sections.length > 0;
  const showSeeAll = !isStandaloneMetric && !showAllFields && hasAllFields;
  let defaultEmptyStateText = t`No dimensions found`;
  let defaultSectionHeader = t`Dimensions`;

  if (hasMultipleMetricSources(metricSlots)) {
    defaultEmptyStateText = t`No shared dimensions found`;
    defaultSectionHeader = t`Shared dimensions`;
  }

  const handleSelect = useCallback(
    (item: DimensionPickerItem) => {
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
        updateActiveDimensionBreakout((prev) => ({
          ...prev,
          dimensionMapping: item.dimensionBreakoutInfo.dimensionMapping,
          label: item.dimensionBreakoutInfo.label,
        }));
        trackMetricsViewerDimensionSelected();
        return;
      }

      onSelectDimensionBreakout(item.dimensionBreakoutInfo);
      trackMetricsViewerDimensionSelected();
    },
    [
      activeDimensionBreakout,
      updateActiveDimensionBreakout,
      onSelectDimensionBreakout,
    ],
  );

  const handleAllFieldsSelect = useCallback(
    (item: DimensionPickerItem) => {
      // Clicking an already-selected dimension deselects it: the item's slots
      // lose their dimension, excluding those metric instances from the
      // breakout. All fields items are scoped per metric accordion, so only
      // that metric is affected.
      if (hasMatchingDimensions(item, activeDimensionBreakout)) {
        const clearedSlots = Object.entries(
          item.dimensionBreakoutInfo.dimensionMapping,
        )
          .filter(([, dimensionId]) => dimensionId != null)
          .map(([slotIndex]) => [Number(slotIndex), null] as const);
        updateActiveDimensionBreakout((prev) => ({
          ...prev,
          dimensionMapping: {
            ...prev.dimensionMapping,
            ...Object.fromEntries(clearedSlots),
          },
        }));
        return;
      }

      const dimensionMapping = getComparableDimensionMapping({
        item,
        sections,
        metricSlots,
        activeDimensionBreakout,
      });

      if (activeDimensionBreakout.type === item.dimensionBreakoutInfo.type) {
        updateActiveDimensionBreakout((prev) => ({
          ...prev,
          dimensionMapping,
          label: item.dimensionBreakoutInfo.label,
        }));
        trackMetricsViewerDimensionSelected();
        return;
      }

      const dimensionBreakoutId = getDimensionBreakoutId(item);
      onSelectDimensionBreakout(
        {
          ...item.dimensionBreakoutInfo,
          ...(dimensionBreakoutId ? { id: dimensionBreakoutId } : {}),
          dimensionMapping,
        },
        // Update in place when the breakout already exists (e.g. re-enabling a
        // deselected metric), instead of silently keeping the stale mapping.
        { updateExisting: true },
      );
      trackMetricsViewerDimensionSelected();
    },
    [
      activeDimensionBreakout,
      updateActiveDimensionBreakout,
      onSelectDimensionBreakout,
      sections,
      metricSlots,
    ],
  );

  const handleStandaloneMetricSelect = useCallback(
    (item: DimensionPickerItem) => {
      if (hasSameDimensions(item, activeDimensionBreakout)) {
        return;
      }

      handleAllFieldsSelect(item);
    },
    [activeDimensionBreakout, handleAllFieldsSelect],
  );

  const handleCategorySelect = useCallback(
    (category: DimensionPickerSidebarCategory) => {
      if (expandedCategoryKey !== category.key) {
        setExpandedCategoryKey(null);
      }

      if (isCategorySelected(category, activeDimensionBreakout)) {
        return;
      }

      handleSelect(category);
    },
    [activeDimensionBreakout, expandedCategoryKey, handleSelect],
  );

  const handleToggleCategorySettings = useCallback(
    (category: DimensionPickerSidebarCategory) => {
      setExpandedCategoryKey((currentKey) =>
        currentKey === category.key ? null : category.key,
      );
    },
    [setExpandedCategoryKey],
  );

  const handleCategoryDimensionChange = useCallback(
    (
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
        updateActiveDimensionBreakout((prev) => ({
          ...prev,
          dimensionMapping,
        }));
        return;
      }

      const dimensionMapping = {
        ...category.dimensionBreakoutInfo.dimensionMapping,
        [slotIndex]: dimensionId,
      };
      onSelectDimensionBreakout(
        {
          ...category.dimensionBreakoutInfo,
          dimensionMapping,
        },
        { updateExisting: true },
      );
      trackMetricsViewerDimensionSelected();
    },
    [
      activeDimensionBreakout,
      onSelectDimensionBreakout,
      updateActiveDimensionBreakout,
    ],
  );

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
            {showAllFields ? t`All fields` : t`Break out`}
          </Title>
        </Flex>
        <ActionIcon
          aria-label={t`Close`}
          variant="subtle"
          onClick={closeSidebar}
        >
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
            key={isSearching ? "searching" : "browsing"}
            activeDimensionBreakout={activeDimensionBreakout}
            sections={filteredSections}
            metricSourceDataById={sourceDataById}
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
            {isStandaloneMetric ? (
              <AllFieldsList
                activeDimensionBreakout={activeDimensionBreakout}
                sections={filteredSections}
                metricSourceDataById={sourceDataById}
                sourceColors={sourceColors}
                metricSlots={metricSlots}
                onSelect={handleStandaloneMetricSelect}
              />
            ) : showFieldsByCategory ? (
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
