import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { MetricDefinition, ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  SelectedMetric,
  SourceColorMap,
} from "../../types/viewer-state";
import type { DefinitionSource } from "../../utils/definition-sources";
import {
  applyDefinitionToFormulaEntities,
  getDefinitionSources,
} from "../../utils/definition-sources";
import { FilterPopover } from "../FilterPopover";
import { MetricSearchInput as MetricSearch } from "../MetricSearch";
import { MetricsFilterPills } from "../MetricsFilterPills";

import S from "./MetricSearchPanel.module.css";

type MetricSearchPanelProps = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  onFormulaEntitiesChange: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void;
  selectedMetrics: SelectedMetric[];
  metricColors: SourceColorMap;
  onAddMetric: (metric: SelectedMetric) => void;
  onRemoveMetric: (metricId: number, sourceType: "metric" | "measure") => void;
  onSwapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onSetBreakout: (
    entity: MetricDefinitionEntry,
    dimension: ProjectionClause | undefined,
  ) => void;
};

export function MetricSearchPanel({
  definitions,
  formulaEntities,
  onFormulaEntitiesChange,
  selectedMetrics,
  metricColors,
  onAddMetric,
  onRemoveMetric,
  onSwapMetric,
  onSetBreakout,
}: MetricSearchPanelProps) {
  const [isFilterPillsExpanded, setIsFilterPillsExpanded] = useState(true);

  const definitionSources = useMemo(
    () => getDefinitionSources(formulaEntities, definitions),
    [formulaEntities, definitions],
  );

  const filterCount = useMemo(
    () =>
      definitionSources.reduce(
        (count, source) => count + LibMetric.filters(source.definition).length,
        0,
      ),
    [definitionSources],
  );

  const handleSourceDefinitionChange = useCallback(
    (source: DefinitionSource, newDefinition: MetricDefinition) => {
      onFormulaEntitiesChange(
        applyDefinitionToFormulaEntities(
          formulaEntities,
          source,
          newDefinition,
        ),
      );
    },
    [formulaEntities, onFormulaEntitiesChange],
  );

  const hasDefinitions = definitionSources.length > 0;
  const hasFilters = filterCount > 0;
  const toggleLabel = isFilterPillsExpanded ? t`Hide filters` : t`Show filters`;

  return (
    <Stack gap="md">
      <Flex align="center" justify="space-between" mih="1.875rem">
        <Text fw={700} size="lg">{t`Explore`}</Text>
        {hasDefinitions && (
          <FilterPopover
            definitionSources={definitionSources}
            metricColors={metricColors}
            onSourceDefinitionChange={handleSourceDefinitionChange}
          >
            <Button.Group>
              <Button
                variant="light"
                color="filter"
                size="xs"
                p="sm"
                leftSection={
                  <Icon name={hasFilters ? "filter_plus" : "filter"} />
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
                    py="sm"
                    px="md"
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
            definitions={definitions}
            formulaEntities={formulaEntities}
            onFormulaEntitiesChange={onFormulaEntitiesChange}
            selectedMetrics={selectedMetrics}
            metricColors={metricColors}
            onAddMetric={onAddMetric}
            onRemoveMetric={onRemoveMetric}
            onSwapMetric={onSwapMetric}
            onSetBreakout={onSetBreakout}
          />
        </Box>
        {hasFilters && isFilterPillsExpanded && (
          <Box
            className={S.filterPillsSection}
            px="sm"
            py="xs"
            bg="background-filter"
          >
            <MetricsFilterPills
              definitionSources={definitionSources}
              sourceColors={metricColors}
              onSourceDefinitionChange={handleSourceDefinitionChange}
            />
          </Box>
        )}
      </Box>
    </Stack>
  );
}
