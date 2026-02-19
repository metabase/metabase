import { useCallback, useMemo, useState } from "react";

import { AccordionList } from "metabase/common/components/AccordionList";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type {
  DimensionListItem,
  DimensionSection,
} from "metabase/metrics/components/FilterPicker/FilterDimensionPicker/types";
import { getMetricGroups } from "metabase/metrics/components/FilterPicker/FilterDimensionPicker/utils";
import { FilterPickerBody } from "metabase/metrics/components/FilterPicker/FilterPickerBody";
import { getDimensionIcon } from "metabase/metrics/utils/dimensions";
import { Accordion, Box, Flex, Icon, Text } from "metabase/ui";
import type { FilterClause } from "metabase-lib/metric";

import { parseSourceId } from "../../utils/source-ids";

import S from "./FilterPopover.module.css";
import type {
  FilterPopoverContentProps,
  NavigationState,
  ValidDefinitionEntry,
} from "./types";

const LIST_WIDTH = 320;
const FILTER_WIDTH = 380;

export function FilterPopoverContent({
  validEntries,
  metricColors,
  onFilterApplied,
}: FilterPopoverContentProps) {
  const [navState, setNavState] = useState<NavigationState>({ view: "list" });
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const metricGroups = useMemo(
    () => getMetricGroups(validEntries.map((entry) => entry.definition)),
    [validEntries],
  );

  const handleDimensionSelect = useCallback((item: DimensionListItem) => {
    setNavState({
      view: "filter",
      entryIndex: item.definitionIndex,
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
      const entry = validEntries[navState.entryIndex];
      onFilterApplied(entry.id, filter);
      setNavState({ view: "list" });
    },
    [navState, validEntries, onFilterApplied],
  );

  const renderItemIcon = useCallback((item: DimensionListItem) => {
    const icon = getDimensionIcon(item.dimension);
    return <Icon name={icon} size={18} />;
  }, []);

  if (navState.view === "filter") {
    const entry = validEntries[navState.entryIndex];
    return (
      <Box w={FILTER_WIDTH}>
        <FilterPickerBody
          definition={entry.definition}
          dimension={navState.dimension}
          isNew
          onSelect={handleFilterSelect}
          onBack={handleBack}
        />
      </Box>
    );
  }

  if (validEntries.length === 1) {
    const group = metricGroups[0];
    return (
      <AccordionList<DimensionListItem, DimensionSection>
        className={S.dimensionList}
        sections={group.sections}
        onChange={handleDimensionSelect}
        renderItemName={(item) => item.name}
        renderItemDescription={() => undefined}
        renderItemIcon={renderItemIcon}
        width={LIST_WIDTH}
        maxHeight={Infinity}
        searchable={false}
        alwaysExpanded
      />
    );
  }

  return (
    <Box w={LIST_WIDTH}>
      <Accordion
        chevronPosition="right"
        multiple
        value={expandedItems}
        onChange={setExpandedItems}
        classNames={{
          root: S.accordion,
          item: S.accordionItem,
          panel: S.accordionPanel,
          content: S.accordionContent,
          control: S.accordionControl,
          chevron: S.accordionChevron,
        }}
      >
        {validEntries.map((entry, index) => {
          const group = metricGroups[index];
          const colors = getEntryColors(entry, metricColors);
          return (
            <Accordion.Item key={entry.id} value={entry.id}>
              <Accordion.Control>
                <AccordionItemLabel
                  icon={group.icon}
                  name={group.metricName}
                  colors={colors}
                />
              </Accordion.Control>
              <Accordion.Panel>
                <AccordionList<DimensionListItem, DimensionSection>
                  className={S.dimensionList}
                  sections={group.sections}
                  onChange={handleDimensionSelect}
                  renderItemName={(item) => item.name}
                  renderItemDescription={() => undefined}
                  renderItemIcon={renderItemIcon}
                  width="100%"
                  maxHeight={Infinity}
                  searchable={false}
                  alwaysExpanded
                />
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Box>
  );
}

function AccordionItemLabel({
  icon,
  name,
  colors,
}: {
  icon: "metric" | "ruler";
  name: string;
  colors: string[] | undefined;
}) {
  return (
    <Flex align="center" gap="sm">
      <SourceColorIndicator colors={colors} fallbackIcon={icon} size={16} />
      <Text fw={700}>{name}</Text>
    </Flex>
  );
}

function getEntryColors(
  entry: ValidDefinitionEntry,
  metricColors: FilterPopoverContentProps["metricColors"],
): string[] | undefined {
  const { type, id } = parseSourceId(entry.id);
  const sourceId = `${type}:${id}` as const;
  return metricColors[sourceId];
}
