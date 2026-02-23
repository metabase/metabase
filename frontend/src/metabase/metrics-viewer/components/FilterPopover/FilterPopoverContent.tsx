import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type {
  DimensionListItem,
  DimensionSection,
} from "metabase/metrics/components/FilterPicker/FilterDimensionPicker/types";
import { getMetricGroups } from "metabase/metrics/components/FilterPicker/FilterDimensionPicker/utils";
import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import { getDimensionIcon } from "metabase/metrics/utils/dimensions";
import type { IconName } from "metabase/ui";
import { Box, Flex, Icon, Text, TextInput, UnstyledButton } from "metabase/ui";
import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
} from "metabase-lib/metric";

import type { MetricSourceId, SourceColorMap } from "../../types/viewer-state";

import S from "./FilterPopover.module.css";

const LIST_WIDTH = 320;
const FILTER_WIDTH = 380;
const DIMENSION_LIST_MAX_HEIGHT = Infinity;

export type DefinitionSource = {
  id: MetricSourceId;
  definition: MetricDefinition;
};

type NavigationState =
  | { view: "list" }
  | { view: "filter"; definitionIndex: number; dimension: DimensionMetadata };

type DisplayMetricGroup = {
  id: MetricSourceId;
  metricName: string;
  icon: IconName;
  colors: string[] | undefined;
  sections: DimensionSection[];
};

interface FilterPopoverContentProps {
  definitions: DefinitionSource[];
  metricColors: SourceColorMap;
  onFilterApplied: (id: MetricSourceId, filter: FilterClause) => void;
}

export function FilterPopoverContent({
  definitions,
  metricColors,
  onFilterApplied,
}: FilterPopoverContentProps) {
  const [navState, setNavState] = useState<NavigationState>({ view: "list" });
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");

  const displayGroups = useMemo((): DisplayMetricGroup[] => {
    const rawGroups = getMetricGroups(
      definitions.map((definition) => definition.definition),
    );
    return rawGroups.map((group, index) => {
      const sourceId = definitions[index].id;
      return {
        id: sourceId,
        metricName: group.metricName,
        icon: group.icon,
        colors: metricColors[sourceId],
        sections: group.sections,
      };
    });
  }, [definitions, metricColors]);

  const filteredDisplayGroups = useMemo((): DisplayMetricGroup[] | null => {
    if (!searchText.trim()) {
      return null;
    }
    const lowerSearch = searchText.toLowerCase();
    return displayGroups
      .map((group) => {
        const filteredSections: DimensionSection[] = group.sections
          .map((section) => ({
            ...section,
            items: section.items?.filter((item) =>
              item.name.toLowerCase().includes(lowerSearch),
            ),
          }))
          .filter((section) => section.items && section.items.length > 0);

        return {
          ...group,
          sections: filteredSections,
        };
      })
      .filter((group) => group.sections.length > 0);
  }, [displayGroups, searchText]);

  const handleDimensionSelect = useCallback((item: DimensionListItem) => {
    setNavState({
      view: "filter",
      definitionIndex: item.definitionIndex,
      dimension: item.dimension,
    });
  }, []);

  const handleBack = useCallback(() => {
    setNavState({ view: "list" });
  }, []);

  const handleFilterSelect = useCallback(
    (filter: FilterClause) => {
      if (navState.view !== "filter") {
        return;
      }
      const selected = definitions[navState.definitionIndex];
      if (!selected) {
        return;
      }
      onFilterApplied(selected.id, filter);
      setNavState({ view: "list" });
    },
    [navState, definitions, onFilterApplied],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const isSearching = filteredDisplayGroups !== null;
  const visibleGroups = isSearching ? filteredDisplayGroups : displayGroups;
  const hasNoResults = isSearching && visibleGroups.length === 0;
  const showMetricHeaders = definitions.length > 1;

  if (navState.view === "filter") {
    const selected = definitions[navState.definitionIndex];
    if (!selected) {
      return null;
    }
    return (
      <Box w={FILTER_WIDTH}>
        <FilterPickerBody
          definition={selected.definition}
          dimension={navState.dimension}
          isNew
          onSelect={handleFilterSelect}
          onBack={handleBack}
        />
      </Box>
    );
  }

  return (
    <>
      <Box w={LIST_WIDTH} p="sm" className={S.searchSection}>
        <TextInput
          placeholder={t`Search dimensions...`}
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          leftSection={<Icon name="search" size={16} />}
          size="md"
          radius="md"
        />
      </Box>

      <Box w={LIST_WIDTH} className={S.listSection}>
        {hasNoResults ? (
          <Box p="xl">
            <Text c="text-secondary" ta="center">
              {t`No dimensions found`}
            </Text>
          </Box>
        ) : showMetricHeaders ? (
          <MetricGroupList
            groups={visibleGroups}
            expandedItems={expandedItems}
            collapsible={!isSearching}
            onToggleExpanded={toggleExpanded}
            onDimensionSelect={handleDimensionSelect}
          />
        ) : (
          <DimensionList
            sections={visibleGroups[0]?.sections ?? []}
            onSelect={handleDimensionSelect}
          />
        )}
      </Box>
    </>
  );
}

function DimensionList({
  sections,
  onSelect,
}: {
  sections: DimensionSection[];
  onSelect: (item: DimensionListItem) => void;
}) {
  const renderItemIcon = useCallback((item: DimensionListItem) => {
    const icon = getDimensionIcon(item.dimension);
    return <Icon name={icon} size={16} />;
  }, []);

  return (
    <AccordionList<DimensionListItem, DimensionSection>
      className={S.dimensionList}
      sections={sections}
      onChange={onSelect}
      renderItemName={(item) => item.name}
      renderItemIcon={renderItemIcon}
      width="100%"
      maxHeight={DIMENSION_LIST_MAX_HEIGHT}
      searchable={false}
      alwaysExpanded
    />
  );
}

function MetricGroupList({
  groups,
  expandedItems,
  collapsible,
  onToggleExpanded,
  onDimensionSelect,
}: {
  groups: DisplayMetricGroup[];
  expandedItems: string[];
  collapsible: boolean;
  onToggleExpanded: (id: string) => void;
  onDimensionSelect: (item: DimensionListItem) => void;
}) {
  return (
    <Box>
      {groups.map((group) => {
        const isExpanded = !collapsible || expandedItems.includes(group.id);
        const hasDimensions = group.sections.some(
          (section) => section.items && section.items.length > 0,
        );
        const showDimensions = isExpanded && hasDimensions;

        return (
          <Box key={group.id} className={S.accordionItem}>
            {collapsible ? (
              <UnstyledButton
                className={cx(S.accordionControl, {
                  [S.accordionControlExpanded]: showDimensions,
                })}
                onClick={() => onToggleExpanded(group.id)}
                w="100%"
              >
                <Flex align="center" gap="sm" px="md">
                  <SourceColorIndicator
                    colors={group.colors}
                    fallbackIcon={group.icon}
                    size={16}
                  />
                  <Box fw={700}>{group.metricName}</Box>
                  <Icon
                    name={isExpanded ? "chevronup" : "chevrondown"}
                    size={12}
                  />
                </Flex>
              </UnstyledButton>
            ) : (
              <Box
                className={cx(S.accordionHeader, {
                  [S.accordionHeaderExpanded]: showDimensions,
                })}
                px="md"
              >
                <Flex align="center" gap="sm">
                  <SourceColorIndicator
                    colors={group.colors}
                    fallbackIcon={group.icon}
                    size={16}
                  />
                  <Box fw={700}>{group.metricName}</Box>
                </Flex>
              </Box>
            )}
            {showDimensions && (
              <Box pb="sm">
                <DimensionList
                  sections={group.sections}
                  onSelect={onDimensionSelect}
                />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
