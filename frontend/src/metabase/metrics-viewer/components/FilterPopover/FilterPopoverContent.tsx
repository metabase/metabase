import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type {
  DimensionListItem,
  DimensionSection,
  MetricGroup,
  SegmentListItem,
} from "metabase/metrics/components/FilterPicker/FilterDimensionPicker/types";
import { getMetricGroups } from "metabase/metrics/components/FilterPicker/FilterDimensionPicker/utils";
import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import { getDimensionIcon } from "metabase/metrics/utils/dimensions";
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
import { filterDisplayGroupsBySearch } from "./utils";

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
  const hasAnySegments = visibleGroups.some(
    (group) => (group.segments?.length ?? 0) > 0,
  );
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
          <>
            {(visibleGroups[0]?.segments?.length ?? 0) > 0 && (
              <SegmentList
                items={visibleGroups[0]?.segments ?? []}
                onSelect={handleSegmentSelect}
              />
            )}
            <DimensionList
              sections={visibleGroups[0]?.sections ?? []}
              onSelect={handleDimensionSelect}
            />
          </>
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
      maxHeight={Infinity}
      searchable={false}
      alwaysExpanded
    />
  );
}

function SegmentList({
  items,
  onSelect,
}: {
  items: SegmentListItem[];
  onSelect: (item: SegmentListItem) => void;
}) {
  return (
    <Box>
      {items.map((item, index) => (
        <UnstyledButton
          key={`${item.definitionIndex}-${index}-${item.name}`}
          className={S.segmentItem}
          onClick={() => onSelect(item)}
          w="100%"
          px="md"
          py="xs"
        >
          <Flex align="center" gap="sm">
            <Icon name="star" size={16} />
            <Box>{item.name}</Box>
          </Flex>
        </UnstyledButton>
      ))}
    </Box>
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
        const hasDimensions = group.sections.some(
          (section) => section.items && section.items.length > 0,
        );
        const hasSegments = (group.segments?.length ?? 0) > 0;
        const showDimensions = isExpanded && hasDimensions;
        const showSegments = isExpanded && hasSegments;

        return (
          <Box key={group.id} className={S.accordionItem}>
            {collapsible ? (
              <UnstyledButton
                className={cx(S.accordionControl, {
                  [S.accordionControlExpanded]: showDimensions || showSegments,
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
                  [S.accordionHeaderExpanded]: showDimensions || showSegments,
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
            {showSegments && (
              <Box pb="xs">
                <SegmentList
                  items={group.segments ?? []}
                  onSelect={onSegmentSelect}
                />
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
