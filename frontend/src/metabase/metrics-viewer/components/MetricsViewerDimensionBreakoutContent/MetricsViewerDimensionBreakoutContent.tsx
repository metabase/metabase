import { useCallback, useMemo } from "react";

import { DimensionPillBar } from "metabase/metrics-viewer/components/DimensionPillBar";
import { MetricControls } from "metabase/metrics-viewer/components/MetricControls";
import { MetricsViewerVisualization } from "metabase/metrics-viewer/components/MetricsViewerVisualization";
import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import {
  buildDimensionItemsFromDefinitions,
  getDimensionBreakoutConfig,
  getProjectionInfo,
  shouldShowStackSeries,
} from "metabase/metrics-viewer/utils";
import { Box, Flex, Stack } from "metabase/ui";
import { getObjectKeys } from "metabase/utils/objects";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

export function MetricsViewerDimensionBreakoutContent() {
  const {
    definitions,
    formulaEntities,
    activeDimensionBreakout: dimensionBreakout,
    queriesAreLoading,
    queriesError,
    modifiedDefinitionsBySlotIndex,
    metricSlots,
    series: rawSeries,
    cardIdToEntityIndex,
    sourceColors,
    showColumnLabels,
    updateActiveDimensionBreakout: onDimensionBreakoutUpdate,
  } = useMetricsViewerContext();

  const dimensionItems = useMemo(
    () =>
      dimensionBreakout
        ? buildDimensionItemsFromDefinitions(
            definitions,
            dimensionBreakout.dimensionMapping,
            modifiedDefinitionsBySlotIndex,
            sourceColors,
            metricSlots,
            formulaEntities,
            dimensionBreakout.projectionConfig,
            getDimensionBreakoutConfig(dimensionBreakout.type)
              .dimensionPredicate,
          )
        : [],
    [
      definitions,
      dimensionBreakout,
      modifiedDefinitionsBySlotIndex,
      sourceColors,
      metricSlots,
      formulaEntities,
    ],
  );

  const definitionForControls = useMemo((): MetricDefinition | null => {
    if (!dimensionBreakout) {
      return null;
    }
    if (dimensionBreakout.type === "scalar") {
      return modifiedDefinitionsBySlotIndex.values().next().value ?? null;
    }

    for (const key of getObjectKeys(dimensionBreakout.dimensionMapping)) {
      const slotIndex = Number(key);
      const modDef = modifiedDefinitionsBySlotIndex.get(slotIndex);
      if (!modDef) {
        continue;
      }
      const projs = LibMetric.projections(modDef);
      if (projs.length > 0) {
        return modDef;
      }
    }
    return null;
  }, [dimensionBreakout, modifiedDefinitionsBySlotIndex]);

  const allFilterDimensions = useMemo(() => {
    const filterDimensions: DimensionMetadata[] = [];
    if (!dimensionBreakout) {
      return filterDimensions;
    }
    for (const key of getObjectKeys(dimensionBreakout.dimensionMapping)) {
      const slotIndex = Number(key);
      const modDef = modifiedDefinitionsBySlotIndex.get(slotIndex);
      if (!modDef) {
        continue;
      }
      const projInfo = getProjectionInfo(modDef);
      if (projInfo.filterDimension) {
        filterDimensions.push(projInfo.filterDimension);
      }
    }
    return filterDimensions;
  }, [dimensionBreakout, modifiedDefinitionsBySlotIndex]);

  const handleBrush = useCallback(
    ({ start, end }: { start: number; end: number }) => {
      onDimensionBreakoutUpdate({
        projectionConfig: {
          ...dimensionBreakout?.projectionConfig,
          dimensionFilter: {
            type: "specific-date",
            operator: "between",
            values: [new Date(start), new Date(end)],
            hasTime: true,
          },
        },
      });
    },
    [onDimensionBreakoutUpdate, dimensionBreakout?.projectionConfig],
  );

  if (!dimensionBreakout) {
    return null;
  }

  const showStackSeries = shouldShowStackSeries(
    dimensionBreakout.display,
    rawSeries,
    formulaEntities,
    definitions,
  );

  const isTimeDimensionBreakout = dimensionBreakout.type === "time";

  const dimensionBreakoutConfig = getDimensionBreakoutConfig(
    dimensionBreakout.type,
  );
  const hasAnyOptions = dimensionItems.some((item) =>
    item.type === "expression"
      ? item.metricSources.some((s) => s.availableOptions.length > 0)
      : item.availableOptions.length > 0,
  );
  const hideDimensionPill =
    dimensionBreakoutConfig.minDimensions === 0 && !hasAnyOptions;
  return (
    <Stack flex="1 0 auto" gap={0}>
      <MetricsViewerVisualization
        rawSeries={rawSeries}
        onBrush={isTimeDimensionBreakout ? handleBrush : undefined}
        definitions={definitions}
        formulaEntities={formulaEntities}
        metricSlots={metricSlots}
        dimensionBreakout={dimensionBreakout}
        onDimensionBreakoutUpdate={onDimensionBreakoutUpdate}
        cardIdToEntityIndex={cardIdToEntityIndex}
        queriesAreLoading={queriesAreLoading}
        queriesError={queriesError}
      />
      {!hideDimensionPill && showColumnLabels && (
        <Box mt="sm">
          <DimensionPillBar items={dimensionItems} />
        </Box>
      )}
      {definitionForControls && (
        <Flex mt="md" justify="center" align="center">
          <MetricControls
            definition={definitionForControls}
            allFilterDimensions={allFilterDimensions}
            showStackSeries={showStackSeries}
            canToggleColumnLabels={!hideDimensionPill}
          />
        </Flex>
      )}
    </Stack>
  );
}
