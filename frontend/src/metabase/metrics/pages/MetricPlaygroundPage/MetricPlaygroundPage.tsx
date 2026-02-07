import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";

import {
  useLazyGetMeasureQuery,
  useLazyGetMetricQuery,
  useListMeasuresQuery,
  useListMetricsQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import {
  FilterPicker,
  FilterPickerButton,
} from "metabase/metrics/components/FilterPicker";
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
import { Box, MultiSelect, Popover, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type {
  Measure,
  MeasureId,
  Metric,
  MetricId,
  TemporalUnit,
} from "metabase-types/api";

export function MetricPlaygroundPage() {
  const { data: metrics = [] } = useListMetricsQuery();
  const { data: measures = [] } = useListMeasuresQuery();
  const [fetchMetric] = useLazyGetMetricQuery();
  const [fetchMeasure] = useLazyGetMeasureQuery();
  const [metricIds, setMetricIds] = useState<MetricId[]>([]);
  const [measureIds, setMeasureIds] = useState<MeasureId[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<
    DatePickerValue | undefined
  >(undefined);
  const [selectedUnit, setSelectedUnit] = useState<TemporalUnit | undefined>(
    undefined,
  );
  const [
    isFilterPickerOpen,
    { open: openFilterPicker, close: closeFilterPicker },
  ] = useDisclosure();
  const [
    isTimeseriesBucketPickerOpen,
    { open: openTimeseriesBucketPicker, close: closeTimeseriesBucketPicker },
  ] = useDisclosure();
  const [
    isTimeseriesFilterPickerOpen,
    { open: openTimeseriesFilterPicker, close: closeTimeseriesFilterPicker },
  ] = useDisclosure();

  const metadata = useSelector(getMetadata);
  const metadataProvider = useMemo(
    () => LibMetric.metadataProvider(metadata),
    [metadata],
  );
  const definitions = useMemo(
    () => getMetricDefinitions(metricIds, measureIds, metadataProvider),
    [metricIds, measureIds, metadataProvider],
  );

  const handleMetricChange = (value: string[]) => {
    const metricIds = value.map(getMetricId);
    setMetricIds(metricIds);
    metricIds.forEach((metricId) => fetchMetric(metricId));
  };

  const handleMeasureChange = (value: string[]) => {
    const measureIds = value.map(getMeasureId);
    setMeasureIds(measureIds);
    measureIds.forEach((measureId) => fetchMeasure(measureId));
  };

  const handleFilterChange = (
    definition: LibMetric.MetricDefinition,
    filter: LibMetric.FilterClause,
  ) => {
    const displayName = LibMetric.displayInfo(definition, filter).displayName;
    console.warn(displayName);
    closeFilterPicker();
  };

  const handleTimeseriesFilterChange = (
    filter: DatePickerValue | undefined,
  ) => {
    setSelectedFilter(filter);
    closeTimeseriesFilterPicker();
  };

  const handleTimeseriesBucketChange = (unit: TemporalUnit) => {
    setSelectedUnit(unit);
    closeTimeseriesBucketPicker();
  };
  return (
    <Stack p="md" maw="20rem">
      <MultiSelect
        label="Metrics"
        data={getMetricOptions(metrics)}
        value={metricIds.map(getMetricIdValue)}
        onChange={handleMetricChange}
      />
      <MultiSelect
        label="Measures"
        data={getMeasureOptions(measures)}
        value={measureIds.map(getMeasureIdValue)}
        onChange={handleMeasureChange}
      />
      <Stack gap="xs">
        <Box fw="bold">{`FilterPicker`}</Box>
        <Popover opened={isFilterPickerOpen} onDismiss={closeFilterPicker}>
          <Popover.Target>
            <FilterPickerButton onClick={openFilterPicker} />
          </Popover.Target>
          <Popover.Dropdown>
            <FilterPicker
              definitions={definitions}
              onChange={handleFilterChange}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
      <Stack gap="xs">
        <Box fw="bold">{`TimeseriesFilterPicker`}</Box>
        <Popover
          opened={isTimeseriesFilterPickerOpen}
          onDismiss={closeTimeseriesFilterPicker}
        >
          <Popover.Target>
            <TemporalFilterPickerButton
              selectedFilter={selectedFilter}
              onClick={openTimeseriesFilterPicker}
            />
          </Popover.Target>
          <Popover.Dropdown>
            <TemporalFilterPicker
              dimensions={getDateDimensionsWithDefinition(definitions)}
              selectedFilter={selectedFilter}
              onChange={handleTimeseriesFilterChange}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
      <Stack gap="xs">
        <Box fw="bold">{`TimeseriesBucketPicker`}</Box>
        <Popover
          opened={isTimeseriesBucketPickerOpen}
          onDismiss={closeTimeseriesBucketPicker}
        >
          <Popover.Target>
            <TemporalBucketPickerButton
              selectedUnit={selectedUnit}
              onClick={openTimeseriesBucketPicker}
            />
          </Popover.Target>
          <Popover.Dropdown>
            <TemporalBucketPicker
              selectedUnit={selectedUnit}
              dimensions={getDateDimensionsWithDefinition(definitions)}
              onChange={handleTimeseriesBucketChange}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
    </Stack>
  );
}

function getMetricId(value: string): MetricId {
  return Number(value);
}

function getMetricIdValue(metricId: MetricId): string {
  return String(metricId);
}

function getMetricOptions(metrics: Metric[]) {
  return metrics.map((metric) => ({
    value: getMetricIdValue(metric.id),
    label: metric.name,
  }));
}

function getMeasureId(value: string): MeasureId {
  return Number(value);
}

function getMeasureIdValue(measureId: MeasureId): string {
  return String(measureId);
}

function getMeasureOptions(measures: Measure[]) {
  return measures.map((measure) => ({
    value: getMeasureIdValue(measure.id),
    label: measure.name,
  }));
}

function getMetricDefinitions(
  metricIds: MetricId[],
  measureIds: MeasureId[],
  metadataProvider: LibMetric.MetadataProvider,
) {
  const metrics = metricIds
    .map((metricId) => LibMetric.metricMetadata(metadataProvider, metricId))
    .filter((metric) => metric !== null);
  const measures = measureIds
    .map((measureId) => LibMetric.measureMetadata(metadataProvider, measureId))
    .filter((measure) => measure !== null);

  return [
    ...metrics.map((metric) =>
      LibMetric.fromMetricMetadata(metadataProvider, metric),
    ),
    ...measures.map((measure) =>
      LibMetric.fromMeasureMetadata(metadataProvider, measure),
    ),
  ];
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
