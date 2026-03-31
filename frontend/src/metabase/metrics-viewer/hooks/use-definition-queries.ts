import { useEffect, useMemo } from "react";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Dataset,
  ExpressionRef,
  JsMetricDefinition,
  MetricBreakoutValuesResponse,
  TypedProjection,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  type ExpressionDefinitionEntry,
  type ExpressionItemResult,
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
} from "../utils/definition-entries";
import { parseExpression } from "../utils/parse-expression";
import { getTabConfig } from "../utils/tab-config";

export interface UseDefinitionQueriesResult {
  resultsByEntityIndex: Map<number, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitionsByIndex: Map<number, MetricDefinition>;
  breakoutValuesByEntityIndex: Map<number, MetricBreakoutValuesResponse>;
  isExecuting: (id: MetricSourceId) => boolean;
  /**
   * Per-expression-item results. Empty when there are no expression items
   * (pure individual-metric mode). When non-empty the tab should render one
   * chart series per entry alongside any standalone individual-metric series.
   */
  expressionItems: ExpressionItemResult[];
}

type DatasetRequest = {
  entityIndex: number;
  sourceId: MetricSourceId;
  modifiedDefinition: MetricDefinition;
  request: { definition: JsMetricDefinition };
};

type ExpressionItemConfig = {
  entry: ExpressionDefinitionEntry;
  request: { definition: JsMetricDefinition };
  modifiedDefinitions: {
    [sourceId: MetricSourceId]: MetricDefinition;
  };
};

type ExpressionItemError = {
  entry: ExpressionDefinitionEntry;
  error: string;
};

function getModifiedDefinitionForTab(
  definition: MetricsViewerDefinitionEntry,
  tab: MetricsViewerTabState,
): MetricDefinition | null {
  if (!definition.definition) {
    return null;
  }
  const tabConfig = getTabConfig(tab.type);
  const dimensionId = tab.dimensionMapping[definition.id];
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
):
  | {
      definition: JsMetricDefinition;
      modifiedDefinitions: {
        [sourceId: MetricSourceId]: MetricDefinition;
      };
    }
  | { error: string }
  | null {
  const { tokens } = entity;

  // Build leaf refs and projections for each metric occurrence in the expression.
  // Each occurrence gets its own unique UUID keyed by token position so the same
  // metric can appear multiple times (e.g. Revenue / Revenue).
  const leafRefs = new Map<number, ExpressionRef>();
  const projections: TypedProjection[] = [];
  const seenProjections = new Set<string>();
  const modifiedDefinitions: {
    [sourceId: MetricSourceId]: MetricDefinition;
  } = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "metric") {
      continue;
    }

    const definition = definitions[token.sourceId];
    if (!definition) {
      return null; // definition not yet available (e.g. metric was just swapped)
    }
    const modifiedDefinition = getModifiedDefinitionForTab(definition, tab);
    if (!modifiedDefinition) {
      if (!definition.definition) {
        return null; // still loading the metric, not an error
      }
      return { error: `No compatible dimensions` };
    }

    modifiedDefinitions[token.sourceId] = modifiedDefinition;

    const uuid = `leaf-${i}`;
    const metricId = LibMetric.sourceMetricId(modifiedDefinition);
    const measureId = LibMetric.sourceMeasureId(modifiedDefinition);

    if (metricId != null) {
      leafRefs.set(i, ["metric", { "lib/uuid": uuid }, metricId]);
    } else if (measureId != null) {
      leafRefs.set(i, ["measure", { "lib/uuid": uuid }, measureId]);
    } else {
      return null;
    }

    const jsdef = toJsDefinition(modifiedDefinition);
    if (jsdef.projections) {
      for (const proj of jsdef.projections) {
        const key = `${proj.type}:${proj.id}`;
        if (!seenProjections.has(key)) {
          seenProjections.add(key);
          projections.push(proj);
        }
      }
    }
  }

  const expr = parseExpression(tokens, leafRefs);
  if (!expr) {
    return null;
  }

  return {
    modifiedDefinitions,
    definition: {
      expression: expr,
      projections,
    },
  };
}

/**
 * Unified iteration over formulaEntities to build query items.
 * Returns dataset requests for metric entities, expression configs for
 * expression entities, and tracks which sourceIds are referenced by expressions.
 */
function buildQueryItems(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
  tab: MetricsViewerTabState | null,
): {
  datasetRequests: DatasetRequest[];
  expressionItemsConfig: ExpressionItemConfig[];
  expressionItemsErrors: ExpressionItemError[];
} {
  if (!tab) {
    return {
      datasetRequests: [],
      expressionItemsConfig: [],
      expressionItemsErrors: [],
    };
  }

  const datasetRequests: DatasetRequest[] = [];
  const expressionItemsConfig: ExpressionItemConfig[] = [];
  const expressionItemsErrors: ExpressionItemError[] = [];

  formulaEntities.forEach((entity, index) => {
    if (isMetricEntry(entity)) {
      const effectiveEntry = getEffectiveDefinitionEntry(entity, definitions);
      const modifiedDefinition = getModifiedDefinitionForTab(
        effectiveEntry,
        tab,
      );

      if (!modifiedDefinition) {
        return;
      }

      const jsDefinition = toJsDefinition(modifiedDefinition);
      datasetRequests.push({
        entityIndex: index,
        sourceId: entity.id,
        modifiedDefinition,
        request: { definition: jsDefinition },
      });
    }

    if (isExpressionEntry(entity)) {
      const requestData = buildArithmeticRequest(definitions, tab, entity);

      if (requestData && "error" in requestData) {
        expressionItemsErrors.push({
          entry: entity,
          error: requestData.error,
        });
      } else if (requestData) {
        expressionItemsConfig.push({
          entry: entity,
          modifiedDefinitions: requestData.modifiedDefinitions,
          request: {
            definition: requestData?.definition,
          },
        });
      }
    }
  });

  return {
    datasetRequests,
    expressionItemsConfig,
    expressionItemsErrors,
  };
}

export function useDefinitionQueries(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
  tab: MetricsViewerTabState | null,
): UseDefinitionQueriesResult {
  const dispatch = useDispatch();

  const { datasetRequests, expressionItemsConfig, expressionItemsErrors } =
    useMemo(
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

  const modifiedDefinitionsByIndex = useMemo(() => {
    const map = new Map<number, MetricDefinition>();
    for (const { entityIndex, modifiedDefinition } of datasetRequests) {
      map.set(entityIndex, modifiedDefinition);
    }
    return map;
  }, [datasetRequests]);

  useEffect(() => {
    const requestsToMake = [...datasetRequests, ...expressionItemsConfig];

    if (requestsToMake.length === 0) {
      return;
    }

    const subscriptions = requestsToMake.map((query) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(query.request)),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [datasetRequests, dispatch, expressionItemsConfig]);

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
    datasetRequests.map((query) => ({
      entityIndex: query.entityIndex,
      sourceId: query.sourceId,
      result: metricApi.endpoints.getMetricDataset.select(query.request)(state),
    })),
  );

  const expressionItemQueryResults = useSelector((state: State) =>
    expressionItemsConfig.map((query) => {
      return metricApi.endpoints.getMetricDataset.select(query.request)(state);
    }),
  );

  const breakoutResults = useSelector((state: State) =>
    breakoutRequests.map((query) => ({
      entityIndex: query.entityIndex,
      result: metricApi.endpoints.getMetricBreakoutValues.select(query.request)(
        state,
      ),
    })),
  );

  const { resultsByEntityIndex, errorsByDefinitionId, isExecuting } =
    useMemo(() => {
      const results = new Map<number, Dataset>();
      const errors = new Map<MetricSourceId, string>();
      const executing = new Set<MetricSourceId>();

      for (const { entityIndex, sourceId, result } of datasetResults) {
        if (result.data) {
          results.set(entityIndex, result.data);
        }
        if (result.error) {
          errors.set(sourceId, getErrorMessage(result.error));
        }
        if (result.isLoading || ("isFetching" in result && result.isFetching)) {
          executing.add(sourceId);
        }
      }

      return {
        resultsByEntityIndex: results,
        errorsByDefinitionId: errors,
        isExecuting: (id: MetricSourceId) => executing.has(id),
      };
    }, [datasetResults]);

  const breakoutValuesByEntityIndex = useMemo(() => {
    const map = new Map<number, MetricBreakoutValuesResponse>();
    for (const { entityIndex, result } of breakoutResults) {
      if (result.data) {
        map.set(entityIndex, result.data);
      }
    }
    return map;
  }, [breakoutResults]);

  const expressionItems: ExpressionItemResult[] = useMemo(
    () => [
      ...expressionItemsConfig.map(
        ({ entry, modifiedDefinitions: exprModDefs }, idx) => {
          const queryResult = expressionItemQueryResults[idx];
          return {
            entry,
            modifiedDefinitions: exprModDefs,
            result: queryResult?.data ?? null,
            isExecuting: queryResult?.isLoading ?? false,
            requestError: queryResult?.error
              ? getErrorMessage(queryResult.error)
              : null,
            expressionError: null,
          };
        },
      ),
      ...expressionItemsErrors.map(({ entry, error }) => {
        return {
          entry,
          modifiedDefinitions: {},
          result: null,
          isExecuting: false,
          requestError: null,
          expressionError: error,
        };
      }),
    ],
    [expressionItemsConfig, expressionItemQueryResults, expressionItemsErrors],
  );

  return {
    resultsByEntityIndex,
    errorsByDefinitionId,
    modifiedDefinitionsByIndex,
    breakoutValuesByEntityIndex,
    isExecuting,
    expressionItems,
  };
}
