import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { trackMetricsViewerFilterRemoved } from "metabase/metrics-viewer/analytics";
import type { IconName } from "metabase/ui";
import { Flex, Group, Text } from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type { SourceColorMap } from "../../types/viewer-state";
import { isExpressionEntry } from "../../types/viewer-state";
import type { DefinitionSource } from "../../utils/definition-sources";
import {
  getDefinitionSourceIcon,
  getDefinitionSourceName,
} from "../../utils/definition-sources";

import { MetricsFilterPill } from "./MetricsFilterPill";
import { MetricsFilterPillPopover } from "./MetricsFilterPillPopover";

interface MetricsFilterPillsProps {
  definitionSources: DefinitionSource[];
  sourceColors: SourceColorMap;
  onSourceDefinitionChange: (
    source: DefinitionSource,
    definition: MetricDefinition,
  ) => void;
}

type FlattenedFilter = {
  source: DefinitionSource;
  filter: LibMetric.FilterClause;
  colors: string[];
  icon?: IconName;
  key: string;
  metricName?: string;
  metricCount?: number;
  isSegment: boolean;
  segmentName?: string;
};

export function MetricsFilterPills({
  definitionSources,
  sourceColors,
  onSourceDefinitionChange,
}: MetricsFilterPillsProps) {
  const flatFilters = useMemo(
    () => getFlatFilters(definitionSources, sourceColors),
    [definitionSources, sourceColors],
  );

  const handleUpdate = useCallback(
    (
      source: DefinitionSource,
      oldFilter: LibMetric.FilterClause,
      newFilter: LibMetric.FilterClause,
    ) => {
      const newDef = LibMetric.replaceClause(
        source.definition,
        oldFilter,
        newFilter,
      );
      onSourceDefinitionChange(source, newDef);
    },
    [onSourceDefinitionChange],
  );

  const handleRemove = useCallback(
    (source: DefinitionSource, filter: LibMetric.FilterClause) => {
      const newDef = LibMetric.removeClause(source.definition, filter);
      onSourceDefinitionChange(source, newDef);
    },
    [onSourceDefinitionChange],
  );

  if (flatFilters.length === 0) {
    return null;
  }

  return (
    <Group gap="sm">
      {flatFilters.map((item) =>
        item.isSegment ? (
          <MetricsFilterPill
            key={item.key}
            colors={item.colors}
            fallbackIcon="star"
            onRemoveClick={() => {
              handleRemove(item.source, item.filter);
              trackMetricsViewerFilterRemoved("metric_filter");
            }}
            aria-label={t`Segment filter: ${item.segmentName ?? ""}`}
          >
            <Flex align="center" gap="xs">
              {item.metricName && (
                <Text component="span" fw={700} c="inherit" fz="inherit">
                  {item.metricName}
                </Text>
              )}
              <Text component="span" fw={700} c="inherit" fz="inherit">
                {item.segmentName}
              </Text>
            </Flex>
          </MetricsFilterPill>
        ) : (
          <MetricsFilterPillPopover
            key={item.key}
            definition={item.source.definition}
            filter={item.filter}
            colors={item.colors}
            icon={item.icon}
            metricName={item.metricName}
            metricCount={item.metricCount}
            onUpdate={(newFilter) =>
              handleUpdate(item.source, item.filter, newFilter)
            }
            onRemove={() => handleRemove(item.source, item.filter)}
          />
        ),
      )}
    </Group>
  );
}

function getFlatFilters(
  sources: DefinitionSource[],
  sourceColors: SourceColorMap,
): FlattenedFilter[] {
  return sources.flatMap((source) => {
    const colors = sourceColors[source.entityIndex] ?? [
      "var(--mb-color-text-primary)",
    ];
    const icon = getDefinitionSourceIcon(source);
    const shouldDisplayMetricName =
      isExpressionEntry(source.entity) &&
      source.entity.tokens.filter((token) => token.type === "metric").length >
        1;
    return LibMetric.filters(source.definition).map((filter, filterIndex) => {
      const isSegment = LibMetric.isSegmentFilter(filter);
      let segmentName: string | undefined;
      if (isSegment) {
        const segmentMetadata = LibMetric.segmentMetadataForFilter(
          source.definition,
          filter,
        );
        if (segmentMetadata) {
          segmentName = LibMetric.displayInfo(
            source.definition,
            segmentMetadata,
          ).displayName;
        }
      }
      return {
        source,
        filter,
        colors,
        icon,
        key: `${source.index}-${filterIndex}`,
        metricName: shouldDisplayMetricName
          ? getDefinitionSourceName(source)
          : undefined,
        metricCount: source.token?.count,
        isSegment,
        segmentName,
      };
    });
  });
}
