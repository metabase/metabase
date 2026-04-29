import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import {
  Badge,
  Box,
  Flex,
  Icon,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import type {
  DimensionMetadata,
  FilterClause,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { SourceColorMap } from "../../types/viewer-state";
import type { DefinitionSource } from "../../utils/definition-sources";

import S from "./FilterPopover.module.css";
import { MetricGroupFilterSectionList } from "./MetricGroupFilterSectionList";
import type { DimensionListItem, MetricGroup, SegmentListItem } from "./types";
import { filterDisplayGroupsBySearch, getMetricGroups } from "./utils";

const LIST_WIDTH = "20rem";
const FILTER_WIDTH = "24rem";

type NavigationState =
  | { view: "list" }
  | { view: "filter"; definitionIndex: number; dimension: DimensionMetadata };

interface FilterPopoverContentProps {
  definitionSources: DefinitionSource[];
  metricColors: SourceColorMap;
  onSourceDefinitionChange: (
    source: DefinitionSource,
    newDefinition: MetricDefinition,
  ) => void;
  onFilterApplied: () => void;
}

export function FilterPopoverContent({
  definitionSources,
  metricColors,
  onSourceDefinitionChange,
  onFilterApplied,
}: FilterPopoverContentProps) {
  const [navState, setNavState] = useState<NavigationState>({ view: "list" });
  const [expandedItems, setExpandedItems] = useState<number[]>([]);
  const [searchText, setSearchText] = useState("");

  const displayGroups = useMemo((): MetricGroup[] => {
    return getMetricGroups(definitionSources, metricColors);
  }, [definitionSources, metricColors]);

  const filteredDisplayGroups = useMemo(
    () => filterDisplayGroupsBySearch(displayGroups, searchText),
    [displayGroups, searchText],
  );

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
      const selected = definitionSources[navState.definitionIndex];
      const newDefinition = LibMetric.filter(selected.definition, filter);
      onSourceDefinitionChange(selected, newDefinition);
      onFilterApplied();
      setNavState({ view: "list" });
    },
    [navState, definitionSources, onFilterApplied, onSourceDefinitionChange],
  );

  const handleSegmentSelect = useCallback(
    (item: SegmentListItem) => {
      const selected = definitionSources[item.definitionIndex];
      if (!selected) {
        return;
      }
      const newDefinition = LibMetric.addSegmentFilter(
        selected.definition,
        item.segment,
      );
      onSourceDefinitionChange(selected, newDefinition);
      onFilterApplied();
    },
    [definitionSources, onFilterApplied, onSourceDefinitionChange],
  );

  const toggleExpanded = useCallback((id: number) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const isSearching = filteredDisplayGroups !== null;
  const visibleGroups = isSearching ? filteredDisplayGroups : displayGroups;
  const hasNoResults = isSearching && visibleGroups.length === 0;
  const hasAnySegments = displayGroups.some((group) => group.hasSegments);
  const showMetricHeaders = definitionSources.length > 1;

  if (navState.view === "filter") {
    const selected = definitionSources[navState.definitionIndex];
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

      <Box w={LIST_WIDTH} className={S.listSection} flex={1} mih={0}>
        {hasNoResults ? (
          <Box p="xl">
            <Text c="text-secondary" ta="center">
              {hasAnySegments
                ? t`No dimensions or segments found`
                : t`No dimensions found`}
            </Text>
          </Box>
        ) : showMetricHeaders ? (
          <MetricGroupList
            groups={visibleGroups}
            expandedItems={expandedItems}
            collapsible={!isSearching}
            onToggleExpanded={toggleExpanded}
            onDimensionSelect={handleDimensionSelect}
            onSegmentSelect={handleSegmentSelect}
          />
        ) : (
          <MetricGroupFilterSectionList
            sections={visibleGroups[0]?.sections ?? []}
            onDimensionSelect={handleDimensionSelect}
            onSegmentSelect={handleSegmentSelect}
          />
        )}
      </Box>
    </>
  );
}

function MetricGroupList({
  groups,
  expandedItems,
  collapsible,
  onToggleExpanded,
  onDimensionSelect,
  onSegmentSelect,
}: {
  groups: MetricGroup[];
  expandedItems: number[];
  collapsible: boolean;
  onToggleExpanded: (id: number) => void;
  onDimensionSelect: (item: DimensionListItem) => void;
  onSegmentSelect: (item: SegmentListItem) => void;
}) {
  return (
    <Box>
      {groups.map((group) => {
        const isExpanded = !collapsible || expandedItems.includes(group.id);
        const hasItems = group.sections.some(
          (section) => section.items && section.items.length > 0,
        );
        const showItems = isExpanded && hasItems;

        return (
          <Box key={group.id} className={S.accordionItem}>
            {collapsible ? (
              <UnstyledButton
                className={cx(S.accordionControl, {
                  [S.accordionControlExpanded]: showItems,
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
                  <Flex align="center" gap="xs" fw={700}>
                    <span>{group.metricName}</span>
                    {(group.metricCount ?? 0) > 1 && (
                      <Badge circle c="text-hover">
                        {group.metricCount}
                      </Badge>
                    )}
                  </Flex>
                  <Icon
                    name={isExpanded ? "chevronup" : "chevrondown"}
                    size={12}
                  />
                </Flex>
              </UnstyledButton>
            ) : (
              <Box
                className={cx(S.accordionHeader, {
                  [S.accordionHeaderExpanded]: showItems,
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
            {showItems && (
              <Box pb="sm">
                <MetricGroupFilterSectionList
                  sections={group.sections}
                  onDimensionSelect={onDimensionSelect}
                  onSegmentSelect={onSegmentSelect}
                />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
