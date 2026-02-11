import { useCallback, useMemo } from "react";

import { AccordionList } from "metabase/common/components/AccordionList";
import { getDimensionIcon } from "metabase/metrics/utils/dimensions";
import { Accordion, Flex, Icon, Text } from "metabase/ui";
import type * as LibMetric from "metabase-lib/metric";

import { WIDTH } from "../constants";

import S from "./FilterDimensionPicker.module.css";
import type { DimensionListItem, DimensionSection } from "./types";
import { getMetricGroups } from "./utils";

interface FilterDimensionPickerProps {
  definitions: LibMetric.MetricDefinition[];
  onSelect: (
    definition: LibMetric.MetricDefinition,
    definitionIndex: number,
    dimension: LibMetric.DimensionMetadata,
  ) => void;
}

export function FilterDimensionPicker({
  definitions,
  onSelect,
}: FilterDimensionPickerProps) {
  const metricGroups = useMemo(
    () => getMetricGroups(definitions),
    [definitions],
  );

  const handleSelect = useCallback(
    (item: DimensionListItem) => {
      onSelect(item.definition, item.definitionIndex, item.dimension);
    },
    [onSelect],
  );

  const renderItemIcon = useCallback((item: DimensionListItem) => {
    const icon = getDimensionIcon(item.dimension);
    return <Icon name={icon} size={18} />;
  }, []);

  if (definitions.length === 0) {
    return null;
  }

  if (metricGroups.length === 1) {
    const group = metricGroups[0];
    return (
      <AccordionList<DimensionListItem, DimensionSection>
        className={S.dimensionList}
        sections={group.sections}
        onChange={handleSelect}
        renderItemName={(item) => item.name}
        renderItemDescription={() => undefined}
        renderItemIcon={renderItemIcon}
        width={WIDTH}
        maxHeight={Infinity}
        itemTestId="dimension-list-item"
        alwaysExpanded
      />
    );
  }

  const defaultValues = metricGroups.map((_, i) => `metric-${i}`);

  return (
    <Accordion
      multiple
      defaultValue={defaultValues}
      classNames={{
        item: S.metricItem,
        control: S.metricControl,
        label: S.metricLabel,
        content: S.metricContent,
        chevron: S.metricChevron,
      }}
    >
      {metricGroups.map((group, i) => (
        <Accordion.Item key={i} value={`metric-${i}`}>
          <Accordion.Control>
            <Flex align="center" gap="sm">
              <Icon name={group.icon} />
              <Text fw="bold" fz="md">
                {group.metricName}
              </Text>
            </Flex>
          </Accordion.Control>
          <Accordion.Panel>
            <AccordionList<DimensionListItem, DimensionSection>
              className={S.dimensionList}
              sections={group.sections}
              onChange={handleSelect}
              renderItemName={(item) => item.name}
              renderItemDescription={() => undefined}
              renderItemIcon={renderItemIcon}
              width={WIDTH}
              maxHeight={Infinity}
              itemTestId="dimension-list-item"
              alwaysExpanded
            />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
