import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useLazyGetMeasureQuery,
  useLazyGetMetricQuery,
  useListMeasuresQuery,
  useListMetricsQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { MetricFilterPicker } from "metabase/metrics/components/MetricFilterPicker";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Icon, MultiSelect, Popover, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { Measure, MeasureId, Metric, MetricId } from "metabase-types/api";

export function MetricPlaygroundPage() {
  const { data: metrics = [] } = useListMetricsQuery();
  const { data: measures = [] } = useListMeasuresQuery();
  const [fetchMetric] = useLazyGetMetricQuery();
  const [fetchMeasure] = useLazyGetMeasureQuery();
  const [metricIds, setMetricIds] = useState<MetricId[]>([]);
  const [measureIds, setMeasureIds] = useState<MeasureId[]>([]);

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
      <Popover>
        <Popover.Target>
          <Button leftSection={<Icon name="filter" />}>{t`Filter`}</Button>
        </Popover.Target>
        <Popover.Dropdown>
          <MetricFilterPicker
            definitions={definitions}
            onChange={handleFilterChange}
          />
        </Popover.Dropdown>
      </Popover>
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
