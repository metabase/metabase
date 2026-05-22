import { useMemo, useState } from "react";
import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { trackMetricsViewerDimensionTabAdded } from "metabase/metrics-viewer/analytics";
import type {
  MetricSourceId,
  MetricsViewerTabState,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import {
  type AvailableDimensionsResult,
  type DimensionPickerItem,
  type DimensionPickerSection,
  type DimensionPickerSidebarCategory,
  type DimensionPickerSidebarCategorySelectRow,
  type SourceDisplayInfo,
  type TabInfo,
  buildDimensionPickerSections,
  buildDimensionPickerSidebarCategories,
  buildDimensionPickerSidebarCategorySelectRows,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "metabase/ui";
import { isNotNull } from "metabase/utils/types";

import S from "./DimensionPickerSidebar.module.css";
import { useDimensionPickerSidebar } from "./DimensionPickerSidebarContext";

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

function getDimensionIds(tabInfo: TabInfo | MetricsViewerTabState) {
  return Object.values(tabInfo.dimensionMapping).filter(isNotNull).sort();
}

function hasSameDimensions(
  item: DimensionPickerItem,
  tab: MetricsViewerTabState,
) {
  if (item.tabInfo.type !== tab.type) {
    return false;
  }

  const itemIds = getDimensionIds(item.tabInfo);
  const tabIds = getDimensionIds(tab);
  return (
    itemIds.length === tabIds.length &&
    itemIds.every((id, index) => id === tabIds[index])
  );
}

function filterSections(
  sections: DimensionPickerSection[],
  searchText: string,
): DimensionPickerSection[] {
  const trimmedSearchText = searchText.trim().toLocaleLowerCase();
  if (!trimmedSearchText) {
    return sections;
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.name.toLocaleLowerCase().includes(trimmedSearchText),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

function getSidebarSectionName(sectionName?: string) {
  if (sectionName === t`Shared`) {
    return t`Shared dimensions`;
  }

  return sectionName;
}

function getSelectedCategoryKey(
  categories: DimensionPickerSidebarCategory[],
  activeTab: MetricsViewerTabState,
) {
  return categories.find((category) => isCategorySelected(category, activeTab))
    ?.key;
}

function isCategorySelected(
  category: DimensionPickerSidebarCategory,
  activeTab: MetricsViewerTabState,
) {
  return (
    hasSameDimensions(category, activeTab) ||
    category.targetItems.some((item) => hasSameDimensions(item, activeTab))
  );
}

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

  return (
    <Box
      component="aside"
      className={S.root}
      data-testid="metrics-viewer-dimension-picker-sidebar"
    >
      <Flex align="center" justify="space-between" px="lg" pt="lg" pb="md">
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

      <Box px="lg" pb="md">
        <TextInput
          classNames={{ input: S.searchInput }}
          size="sm"
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          placeholder={t`Search fields`}
          leftSection={<Icon name="search" size={16} />}
        />
      </Box>

      <ScrollArea flex="1 1 auto" px="lg" pb="lg">
        {showAllFields ? (
          <AllFieldsList
            activeTab={activeTab}
            sections={filteredSections}
            onSelect={handleSelect}
          />
        ) : categories.length > 0 ? (
          <Stack gap="lg">
            <Stack gap="xs">
              <Text px="sm" size="sm" c="text-secondary">
                {t`Shared dimensions`}
              </Text>
              <Stack gap={0}>
                {categories.map((category) => {
                  const isSelected = category.key === selectedTabCategoryKey;
                  const isExpanded = category.key === expandedCategoryKey;
                  const categorySelectRows = getCategorySelectRows({
                    category,
                    activeTab,
                    metricSlots,
                    sourceDataById,
                    sourceColors,
                  });

                  return (
                    <Box key={category.key}>
                      <CategoryButton
                        item={category}
                        isSelected={isSelected}
                        canConfigure={categorySelectRows.length > 0}
                        isExpanded={isExpanded}
                        onClick={() => handleCategorySelect(category)}
                        onConfigure={() =>
                          handleToggleCategorySettings(category)
                        }
                      />
                      {isExpanded && categorySelectRows.length > 0 && (
                        <Stack className={S.categorySelectList} gap="xs">
                          {categorySelectRows.map((row) => (
                            <MetricDimensionSelect
                              key={row.slotIndex}
                              row={row}
                              onChange={(dimensionId) =>
                                handleCategoryDimensionChange(
                                  category,
                                  row.slotIndex,
                                  dimensionId,
                                )
                              }
                            />
                          ))}
                        </Stack>
                      )}
                    </Box>
                  );
                })}
                <UnstyledButton
                  className={S.seeAllButton}
                  onClick={handleSeeAll}
                >
                  {t`See all`}
                </UnstyledButton>
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

function CategoryButton({
  item,
  isSelected,
  canConfigure,
  isExpanded,
  onClick,
  onConfigure,
}: {
  item: DimensionPickerSidebarCategory;
  isSelected: boolean;
  canConfigure: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onConfigure: () => void;
}) {
  return (
    <Flex className={S.categoryRow} data-expanded={isExpanded || undefined}>
      <UnstyledButton
        className={S.categoryItem}
        data-selected={isSelected || undefined}
        aria-label={item.name}
        aria-pressed={isSelected}
        onClick={onClick}
      >
        <Icon className={S.itemIcon} name={item.icon} size={16} />
        <Text className={S.itemLabel} component="span">
          {item.name}
        </Text>
      </UnstyledButton>
      {canConfigure && (
        <ActionIcon
          className={S.settingsButton}
          aria-label={t`Configure ${item.name}`}
          aria-expanded={isExpanded}
          variant="subtle"
          onClick={onConfigure}
        >
          <SettingsSlidersIcon />
        </ActionIcon>
      )}
    </Flex>
  );
}

function SettingsSlidersIcon() {
  return (
    <svg
      className={S.settingsIcon}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 2.5v11" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2.5v11" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="6" r="1.5" fill="currentColor" />
      <circle cx="8" cy="10" r="1.5" fill="currentColor" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function MetricDimensionSelect({
  row,
  onChange,
}: {
  row: DimensionPickerSidebarCategorySelectRow;
  onChange: (dimensionId: string) => void;
}) {
  return (
    <Select
      classNames={{ input: S.metricSelectInput }}
      aria-label={t`Select dimension for ${row.metricName}`}
      data={row.options}
      value={row.value}
      searchable
      nothingFoundMessage={t`No fields found`}
      leftSection={
        <SourceColorIndicator
          colors={row.colors}
          fallbackIcon="metric"
          size={14}
        />
      }
      size="sm"
      onChange={(value) => {
        if (value) {
          onChange(value);
        }
      }}
    />
  );
}

function DimensionButton({
  item,
  isSelected,
  onClick,
}: {
  item: DimensionPickerItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      className={S.item}
      data-selected={isSelected || undefined}
      aria-label={item.name}
      aria-pressed={isSelected}
      onClick={onClick}
    >
      <Icon className={S.itemIcon} name={item.icon} size={16} />
      <Text className={S.itemLabel} component="span">
        {item.name}
      </Text>
    </UnstyledButton>
  );
}

function AllFieldsList({
  activeTab,
  sections,
  onSelect,
}: {
  activeTab: MetricsViewerTabState;
  sections: DimensionPickerSection[];
  onSelect: (item: DimensionPickerItem) => void;
}) {
  if (sections.length === 0) {
    return (
      <Text c="text-secondary" ta="center" py="lg">{t`No fields found`}</Text>
    );
  }

  return (
    <Stack gap="lg">
      {sections.map((section, sectionIndex) => {
        const sectionKey = section.name ?? `section-${sectionIndex}`;
        const sectionName = getSidebarSectionName(section.name);

        return (
          <Stack key={sectionKey} gap="xs">
            {sectionName && (
              <Text px="sm" size="sm" c="text-secondary">
                {sectionName}
              </Text>
            )}
            <Stack gap={0}>
              {section.items.map((item, itemIndex) => (
                <DimensionButton
                  key={`${item.tabInfo.type}-${item.name}-${itemIndex}`}
                  item={item}
                  isSelected={hasSameDimensions(item, activeTab)}
                  onClick={() => onSelect(item)}
                />
              ))}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
