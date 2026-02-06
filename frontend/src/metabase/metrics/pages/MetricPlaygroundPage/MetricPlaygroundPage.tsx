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
  TimeseriesBucketPicker,
  TimeseriesBucketPickerButton,
} from "metabase/metrics/components/TimeseriesBucketPicker";
import {
  TimeseriesFilterPicker,
  TimeseriesFilterPickerButton,
} from "metabase/metrics/components/TimeseriesFilterPicker";
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
        <Popover>
          <Popover.Target>
            <FilterPickerButton />
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
        <Popover>
          <Popover.Target>
            <TimeseriesFilterPickerButton selectedFilter={selectedFilter} />
          </Popover.Target>
          <Popover.Dropdown>
            <TimeseriesFilterPicker
              dimensions={getDateDimensionsWithDefinition(definitions)}
              selectedFilter={selectedFilter}
              onChange={setSelectedFilter}
            />
          </Popover.Dropdown>
        </Popover>
      </Stack>
      <Stack gap="xs">
        <Box fw="bold">{`TimeseriesBucketPicker`}</Box>
        <Popover>
          <Popover.Target>
            <TimeseriesBucketPickerButton selectedUnit={selectedUnit} />
          </Popover.Target>
          <Popover.Dropdown>
            <TimeseriesBucketPicker
              selectedUnit={selectedUnit}
              dimensions={getDateDimensionsWithDefinition(definitions)}
              onChange={setSelectedUnit}
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
