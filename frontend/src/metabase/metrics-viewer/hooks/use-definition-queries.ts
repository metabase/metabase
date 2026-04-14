import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import type { State } from "metabase/redux/store";
import { useDispatch, useSelector } from "metabase/utils/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import { isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  ExpressionRef,
  InstanceFilter,
  MetricBreakoutValuesResponse,
  TypedProjection,
} from "metabase-types/api";
import type { MetricDatasetRequest } from "metabase-types/api/metric";

import {
  type ExpressionDefinitionEntry,
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerFormulaEntity,
  type MetricsViewerTabState,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";
import {
  getModifiedDefinition,
  toJsDefinition,
} from "../utils/definition-cache";
import {
  entryHasBreakout,
  getEffectiveDefinitionEntry,
  getEffectiveTokenDefinitionEntry,
} from "../utils/definition-entries";
import type { MetricSlot } from "../utils/metric-slots";
import {
  computeMetricSlots,
  findExpressionTokenSlot,
  findStandaloneSlot,
} from "../utils/metric-slots";
import { parseExpression } from "../utils/parse-expression";
import { getTabConfig } from "../utils/tab-config";

export interface UseDefinitionQueriesResult {
  resultsByEntityIndex: Map<number, Dataset>;
  queriesAreLoading: boolean;
  queriesError: string | null;
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>;
  breakoutValuesByEntityIndex: Map<number, MetricBreakoutValuesResponse>;
}

function getModifiedDefinitionForTab(
  definition: MetricsViewerDefinitionEntry,
  slotIndex: number,
  tab: MetricsViewerTabState,
): MetricDefinition | null {
  if (!definition.definition) {
    return null;
  }
  const tabConfig = getTabConfig(tab.type);
  const dimensionId = tab.dimensionMapping[slotIndex];
  if (!dimensionId) {
    if (tabConfig.minDimensions > 0) {
      return null;
    }
    return definition.definition;
  }
  return getModifiedDefinition(
    definition.definition,
    dimensionId,
    tab.projectionConfig,
  );
}

function buildArithmeticRequest(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  tab: MetricsViewerTabState,
  entity: ExpressionDefinitionEntry,
  metricSlots: MetricSlot[],
  entityIndex: number,
  datasetRequestsByEntityIndex: Map<number, MetricDatasetRequest>,
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>,
  expressionErrorsByEntityIndex: Map<number, string>,
): void {
  const { tokens } = entity;

  // Build leaf refs and projections for each metric occurrence in the expression.
  // Each occurrence gets its own unique UUID keyed by token position so the same
  // metric can appear multiple times (e.g. Revenue / Revenue).
  const leafRefs = new Map<number, ExpressionRef>();
  const projections: TypedProjection[] = [];
  const filters: InstanceFilter[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "metric") {
      continue;
    }

    const definition = getEffectiveTokenDefinitionEntry(token, definitions);
    // Find the specific slot for this expression token
    const tokenSlot = findExpressionTokenSlot(metricSlots, entityIndex, i);
    const slotIndex = tokenSlot?.slotIndex ?? -1;
    const modifiedDefinition = getModifiedDefinitionForTab(
      definition,
      slotIndex,
      tab,
    );
    if (!modifiedDefinition) {
      if (!definition.definition) {
        return; // still loading the metric, not an error
      }
      expressionErrorsByEntityIndex.set(
        entityIndex,
        t`No compatible dimensions`,
      );
      return;
    }

    modifiedDefinitionsBySlotIndex.set(slotIndex, modifiedDefinition);

    const uuid = `leaf-${i}`;
    const metricId = LibMetric.sourceMetricId(modifiedDefinition);
    const measureId = LibMetric.sourceMeasureId(modifiedDefinition);

    if (metricId != null) {
      leafRefs.set(i, ["metric", { "lib/uuid": uuid }, metricId]);
    } else if (measureId != null) {
      leafRefs.set(i, ["measure", { "lib/uuid": uuid }, measureId]);
    } else {
      expressionErrorsByEntityIndex.set(entityIndex, t`Invalid expression`);
      return;
    }

    const jsdef = toJsDefinition(modifiedDefinition);

    if (jsdef.projections) {
      for (const proj of jsdef.projections) {
        projections.push({
          ...proj,
          "lib/uuid": uuid,
        });
      }
    }

    filters.push(
      ...(jsdef.filters ?? []).map((f) => ({
        "lib/uuid": uuid,
        filter: f.filter,
      })),
    );
  }

  const expr = parseExpression(tokens, leafRefs);
  if (!expr) {
    expressionErrorsByEntityIndex.set(entityIndex, t`Invalid expression`);
    return;
  }

  datasetRequestsByEntityIndex.set(entityIndex, {
    definition: {
      expression: expr,
      projections,
      filters,
    },
  });
}

function buildQueryItems(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
  tab: MetricsViewerTabState | null,
): {
  datasetRequestsByEntityIndex: Map<number, MetricDatasetRequest>;
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>;
  expressionErrorsByEntityIndex: Map<number, string>;
} {
  const datasetRequestsByEntityIndex = new Map<number, MetricDatasetRequest>();
  const modifiedDefinitionsBySlotIndex = new Map<number, MetricDefinition>();
  const expressionErrorsByEntityIndex = new Map<number, string>();

  if (!tab) {
    return {
      datasetRequestsByEntityIndex,
      modifiedDefinitionsBySlotIndex,
      expressionErrorsByEntityIndex,
    };
  }

  const metricSlots = computeMetricSlots(formulaEntities);

  formulaEntities.forEach((entity, entityIndex) => {
    if (isMetricEntry(entity)) {
      const effectiveEntry = getEffectiveDefinitionEntry(entity, definitions);
      const slot = findStandaloneSlot(metricSlots, entityIndex);
      if (!slot) {
        return;
      }
      const modifiedDefinition = getModifiedDefinitionForTab(
        effectiveEntry,
        slot.slotIndex,
        tab,
      );
      if (!modifiedDefinition) {
        return;
      }
      const jsDefinition = toJsDefinition(modifiedDefinition);
      datasetRequestsByEntityIndex.set(entityIndex, {
        definition: jsDefinition,
      });
      modifiedDefinitionsBySlotIndex.set(slot.slotIndex, modifiedDefinition);
    }

    if (isExpressionEntry(entity)) {
      buildArithmeticRequest(
        definitions,
        tab,
        entity,
        metricSlots,
        entityIndex,
        // buildArithmeticRequest mutates these
        datasetRequestsByEntityIndex,
        modifiedDefinitionsBySlotIndex,
        expressionErrorsByEntityIndex,
      );
    }
  });

  return {
    datasetRequestsByEntityIndex,
    modifiedDefinitionsBySlotIndex,
    expressionErrorsByEntityIndex,
  };
}

export function useDefinitionQueries(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
  tab: MetricsViewerTabState | null,
): UseDefinitionQueriesResult {
  const dispatch = useDispatch();

  const {
    datasetRequestsByEntityIndex,
    modifiedDefinitionsBySlotIndex,
    expressionErrorsByEntityIndex,
  } = useMemo(
    () => buildQueryItems(definitions, formulaEntities, tab),
    [definitions, formulaEntities, tab],
  );

  const breakoutRequests = useMemo(() => {
    return formulaEntities.flatMap((entity, entityIndex) => {
      if (!isMetricEntry(entity)) {
        return [];
      }
      const effectiveEntry = getEffectiveDefinitionEntry(entity, definitions);
      if (!effectiveEntry.definition || !entryHasBreakout(effectiveEntry)) {
        return [];
      }

      const jsDefinition = toJsDefinition(effectiveEntry.definition);

      return [
        {
          entityIndex,
          request: { definition: jsDefinition },
        },
      ];
    });
  }, [formulaEntities, definitions]);

  useEffect(() => {
    const requestsToMake = [...datasetRequestsByEntityIndex.values()];

    if (requestsToMake.length === 0) {
      return;
    }

    const subscriptions = requestsToMake.map((request) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(request)),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [datasetRequestsByEntityIndex, dispatch]);

  useEffect(() => {
    if (breakoutRequests.length === 0) {
      return;
    }

    const subscriptions = breakoutRequests.map((query) =>
      dispatch(
        metricApi.endpoints.getMetricBreakoutValues.initiate(query.request),
      ),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [breakoutRequests, dispatch]);

  const datasetResults = useSelector((state: State) =>
    Array.from(datasetRequestsByEntityIndex.entries()).map(
      ([entityIndex, request]) => ({
        entityIndex,
        result: metricApi.endpoints.getMetricDataset.select(request)(state),
      }),
    ),
  );

  const breakoutResults = useSelector((state: State) =>
    breakoutRequests.map((query) => ({
      entityIndex: query.entityIndex,
      result: metricApi.endpoints.getMetricBreakoutValues.select(query.request)(
        state,
      ),
    })),
  );

  const { resultsByEntityIndex, queriesAreLoading, queriesError } =
    useMemo(() => {
      const resultsByEntityIndex = new Map<number, Dataset>();
      let queriesAreLoading = false;
      let queriesError = null;

      for (const { entityIndex, result } of datasetResults) {
        if (result.data?.data?.cols?.length) {
          if (result.data.data.cols.some((col) => isMetric(col))) {
            resultsByEntityIndex.set(entityIndex, result.data);
          } else {
            queriesError = t`Non-numeric metrics are not supported`;
          }
        }
        if (result.error && queriesError == null) {
          queriesError = getErrorMessage(result.error);
        }
        if (result.isLoading || ("isFetching" in result && result.isFetching)) {
          queriesAreLoading = true;
        }
      }

      // only show expression errors if we have no data to show
      if (
        !queriesAreLoading &&
        resultsByEntityIndex.size === 0 &&
        queriesError == null &&
        expressionErrorsByEntityIndex.size > 0
      ) {
        queriesError = expressionErrorsByEntityIndex.values().next().value!;
      }

      return {
        resultsByEntityIndex,
        queriesAreLoading,
        queriesError,
      };
    }, [datasetResults, expressionErrorsByEntityIndex]);

  const breakoutValuesByEntityIndex = useMemo(() => {
    const map = new Map<number, MetricBreakoutValuesResponse>();
    for (const { entityIndex, result } of breakoutResults) {
      if (result.data) {
        map.set(entityIndex, result.data);
      }
    }
    return map;
  }, [breakoutResults]);

  return {
    resultsByEntityIndex,
    queriesAreLoading,
    queriesError,
    modifiedDefinitionsBySlotIndex,
    breakoutValuesByEntityIndex,
  };
}
