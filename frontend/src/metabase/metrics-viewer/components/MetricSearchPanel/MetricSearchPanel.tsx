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
  onFilterButtonClick: () => void;
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
  onFilterButtonClick,
}: MetricSearchPanelProps) {
  const [isFilterPillsExpanded, setIsFilterPillsExpanded] = useState(true);

  const filterCount = useMemo(
    () =>
      definitions.reduce((count, entry) => {
        if (entry.definition == null) {
          return count;
        }
        return count + LibMetric.filters(entry.definition).length;
      }, 0),
    [definitions],
  );

  const hasDefinitions = definitions.length > 0;
  const hasFilters = filterCount > 0;
  const toggleLabel = isFilterPillsExpanded ? t`Hide filters` : t`Show filters`;

  return (
    <Stack gap="sm">
      <Flex align="center" justify="space-between">
        <Text fw={700} size="lg">{t`Explore`}</Text>
        {hasDefinitions && (
          <Button.Group>
            <Button
              variant="light"
              color="filter"
              size="xs"
              p="sm"
              leftSection={
                <Icon name={hasFilters ? "filter_plus" : "filter"} size={14} />
              }
              onClick={onFilterButtonClick}
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
                  onClick={() => setIsFilterPillsExpanded((prev) => !prev)}
                  className={S.filterButtonAttachment}
                >
                  {filterCount}
                </Button>
              </Tooltip>
            )}
          </Button.Group>
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
              definitions={definitions}
              sourceColors={metricColors}
              onUpdateDefinition={onUpdateDefinition}
            />
          </Box>
        )}
      </Box>
    </Stack>
  );
}
