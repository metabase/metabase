import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { FilterPanel } from "metabase/metrics/components/FilterPanel";
import {
  FilterPicker,
  FilterPickerButton,
} from "metabase/metrics/components/FilterPicker";
import { MetricPicker } from "metabase/metrics/components/MetricPicker";
import {
  TemporalBucketPicker,
  TemporalBucketPickerButton,
} from "metabase/metrics/components/TemporalBucketPicker";
import {
  TemporalFilterPicker,
  TemporalFilterPickerButton,
} from "metabase/metrics/components/TemporalFilterPicker";
import type { DimensionWithDefinition } from "metabase/metrics/types";
import type { DatePickerValue } from "metabase/querying/common/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Popover, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { JsMetricDefinition, TemporalUnit } from "metabase-types/api";

export function MetricPlaygroundPage() {
  const [rawDefinitions, setRawDefinitions] = useState<JsMetricDefinition[]>(
    [],
  );
  const [temporalFilter, setTemporalFilter] = useState<
    DatePickerValue | undefined
  >(undefined);
  const [temporalUnit, setTemporalUnit] = useState<TemporalUnit | undefined>(
    undefined,
  );

  const [
    isFilterPickerOpen,
    { open: openFilterPicker, close: closeFilterPicker },
  ] = useDisclosure();
  const [
    isTemporalBucketPickerOpen,
    { open: openTemporalBucketPicker, close: closeTemporalBucketPicker },
  ] = useDisclosure();
  const [
    isTemporalFilterPickerOpen,
    { open: openTemporalFilterPicker, close: closeTemporalFilterPicker },
  ] = useDisclosure();

  const metadata = useSelector(getMetadata);
  const metadataProvider = useMemo(
    () => LibMetric.metadataProvider(metadata),
    [metadata],
  );
  const definitions = useMemo(
    () =>
      rawDefinitions.map((definition) =>
        LibMetric.fromJsMetricDefinition(metadataProvider, definition),
      ),
    [rawDefinitions, metadataProvider],
  );

  const handleDefinitionChange = (
    definitions: LibMetric.MetricDefinition[],
  ) => {
    setRawDefinitions(definitions.map(LibMetric.toJsMetricDefinition));
  };

  const handleFilterSelect = (
    definition: LibMetric.MetricDefinition,
    definitionIndex: number,
    filter: LibMetric.FilterClause,
  ) => {
    const newDefinition = LibMetric.filter(definition, filter);
    const newDefinitions = [...definitions];
    newDefinitions[definitionIndex] = newDefinition;
    handleDefinitionChange(newDefinitions);
    closeFilterPicker();
  };

  const handleFilterRemove = (
    definition: LibMetric.MetricDefinition,
    definitionIndex: number,
    filter: LibMetric.FilterClause,
  ) => {
    const newDefinition = LibMetric.removeClause(definition, filter);
    const newDefinitions = [...definitions];
    newDefinitions[definitionIndex] = newDefinition;
    handleDefinitionChange(newDefinitions);
  };

  const handleTemporalFilterSelect = (filter: DatePickerValue | undefined) => {
    setTemporalFilter(filter);
    closeTemporalFilterPicker();
  };

  const handleTemporalBucketSelect = (unit: TemporalUnit) => {
    setTemporalUnit(unit);
    closeTemporalBucketPicker();
  };

  return (
    <Stack p="md" maw="20rem">
      <Stack gap="xs">
        <Box fw="bold">{`MetricPicker`}</Box>
        <MetricPicker
          definitions={definitions}
          onSelect={() => undefined}
          onRemove={() => undefined}
        />
      </Stack>
      <Stack gap="xs">
        <Box fw="bold">{`FilterPicker`}</Box>
        <Popover opened={isFilterPickerOpen} onDismiss={closeFilterPicker}>
          <Popover.Target>
            <FilterPickerButton onClick={openFilterPicker} />
          </Popover.Target>
          <Popover.Dropdown>
            <FilterPicker
              definitions={definitions}
              onSelect={handleFilterSelect}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
      <Stack gap="xs">
        <Box fw="bold">{`FilterPanel`}</Box>
        <FilterPanel definitions={definitions} onRemove={handleFilterRemove} />
      </Stack>
      <Stack gap="xs">
        <Box fw="bold">{`TemporalFilterPicker`}</Box>
        <Popover
          opened={isTemporalFilterPickerOpen}
          onDismiss={closeTemporalFilterPicker}
        >
          <Popover.Target>
            <TemporalFilterPickerButton
              selectedFilter={temporalFilter}
              onClick={openTemporalFilterPicker}
            />
          </Popover.Target>
          <Popover.Dropdown>
            <TemporalFilterPicker
              dimensions={getDateDimensionsWithDefinition(definitions)}
              selectedFilter={temporalFilter}
              onSelect={handleTemporalFilterSelect}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
      <Stack gap="xs">
        <Box fw="bold">{`TemporalBucketPicker`}</Box>
        <Popover
          opened={isTemporalBucketPickerOpen}
          onDismiss={closeTemporalBucketPicker}
        >
          <Popover.Target>
            <TemporalBucketPickerButton
              selectedUnit={temporalUnit}
              onClick={openTemporalBucketPicker}
            />
          </Popover.Target>
          <Popover.Dropdown>
            <TemporalBucketPicker
              selectedUnit={temporalUnit}
              dimensions={getDateDimensionsWithDefinition(definitions)}
              onSelect={handleTemporalBucketSelect}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
    </Stack>
  );
}

function getDateDimensionsWithDefinition(
  definitions: LibMetric.MetricDefinition[],
) {
  return definitions.reduce(
    (projections: DimensionWithDefinition[], definition) => {
      const dimensions = LibMetric.projectionableDimensions(definition);
      const dimension = dimensions.find(LibMetric.isDateOrDateTime);

      if (dimension) {
        projections.push({ definition, dimension });
      }

      return projections;
    },
    [],
  );
}
