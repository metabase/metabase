import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { MetricDefinition, ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SelectedMetric,
  SourceColorMap,
} from "../../types/viewer-state";
import { FilterPopover } from "../FilterPopover";
import type { DefinitionSource } from "../FilterPopover/FilterPopoverContent";
import { MetricSearch } from "../MetricSearch";
import { MetricsFilterPills } from "../MetricsFilterPills";

import S from "./MetricSearchPanel.module.css";

type MetricSearchPanelProps = {
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  definitions: MetricsViewerDefinitionEntry[];
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    id: MetricSourceId,
    dimension: ProjectionClause | undefined,
  ) => void;
  onUpdateDefinition: (
    id: MetricSourceId,
    definition: MetricDefinition,
  ) => void;
};

export function MetricSearchPanel({
  selectedMetrics,
  metricColors,
  definitions,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
  onUpdateDefinition,
}: MetricSearchPanelProps) {
  const [isFilterPillsExpanded, setIsFilterPillsExpanded] = useState(true);

  const readyDefinitions = useMemo(
    () =>
      definitions.filter(
        (definition): definition is DefinitionSource =>
          definition.definition != null,
      ),
    [definitions],
  );

  const filterCount = useMemo(
    () =>
      readyDefinitions.reduce(
        (count, definition) =>
          count + LibMetric.filters(definition.definition).length,
        0,
      ),
    [readyDefinitions],
  );

  const hasDefinitions = readyDefinitions.length > 0;
  const hasFilters = filterCount > 0;
  const toggleLabel = isFilterPillsExpanded ? t`Hide filters` : t`Show filters`;

  return (
    <Stack gap="sm">
      <Flex align="center" justify="space-between">
        <Text fw={700} size="lg">{t`Explore`}</Text>
        {hasDefinitions && (
          <FilterPopover
            definitions={readyDefinitions}
            metricColors={metricColors}
            onUpdateDefinition={onUpdateDefinition}
          >
            <Button.Group>
              <Button
                variant="light"
                color="filter"
                size="xs"
                p="sm"
                leftSection={
                  <Icon
                    name={hasFilters ? "filter_plus" : "filter"}
                    size={14}
                  />
                }
                className={hasFilters ? S.filterButtonWithCount : undefined}
              >
                {t`Filter`}
              </Button>
              {hasFilters && (
                <Tooltip label={toggleLabel}>
                  <Button
                    variant="light"
                    color="filter"
                    size="xs"
                    p="sm"
                    aria-label={toggleLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsFilterPillsExpanded((prev) => !prev);
                    }}
                    className={S.filterButtonAttachment}
                  >
                    {filterCount}
                  </Button>
                </Tooltip>
              )}
            </Button.Group>
          </FilterPopover>
        )}
      </Flex>
      <Box className={S.container}>
        <Box>
          <MetricSearch
            selectedMetrics={selectedMetrics}
            metricColors={metricColors}
            definitions={definitions}
            onAddMetric={onAddMetric}
            onRemoveMetric={onRemoveMetric}
            onSwapMetric={onSwapMetric}
            onSetBreakout={onSetBreakout}
          />
        </Box>
        {hasFilters && isFilterPillsExpanded && (
          <Box className={S.filterPillsSection} px="sm" py="xs">
            <MetricsFilterPills
              definitions={readyDefinitions}
              sourceColors={metricColors}
              onUpdateDefinition={onUpdateDefinition}
            />
          </Box>
        )}
      </Box>
    </Stack>
  );
}
