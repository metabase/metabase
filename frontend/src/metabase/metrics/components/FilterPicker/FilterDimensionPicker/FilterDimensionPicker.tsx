import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import { getDimensionIcon } from "metabase/metrics/utils/dimensions";
import {
  Box,
  Flex,
  Icon,
  PopoverBackButton,
  Text,
  UnstyledButton,
} from "metabase/ui";
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
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(
    null,
  );

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

  if (selectedGroupIndex != null) {
    const group = metricGroups[selectedGroupIndex];
    return (
      <Box>
        <Box px="md" py="sm">
          <PopoverBackButton onClick={() => setSelectedGroupIndex(null)}>
            {group.metricName}
          </PopoverBackButton>
        </Box>
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
      </Box>
    );
  }

  return (
    <Box>
      <Box px="md" pt="sm" pb="xs">
        <Text fw="bold" fz="md" c="text-medium">
          {t`Pick a metric to filter`}
        </Text>
      </Box>
      {metricGroups.map((group, i) => (
        <UnstyledButton
          key={i}
          className={S.metricListItem}
          w="100%"
          px="md"
          py="sm"
          onClick={() => setSelectedGroupIndex(i)}
        >
          <Flex align="center" justify="space-between">
            <Flex align="center" gap="sm">
              <Icon name={group.icon} c="brand" />
              <Text fw="bold" fz="md">
                {group.metricName}
              </Text>
            </Flex>
            <Icon name="chevronright" c="text-tertiary" />
          </Flex>
        </UnstyledButton>
      ))}
    </Box>
  );
}
