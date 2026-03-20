import { useEffect, useMemo } from "react";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Dataset,
  JsMetricDefinition,
  MetricBreakoutValuesResponse,
  TypedProjection,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { MathOperator } from "../types/operators";
import type {
  ExpressionDefinitionEntry,
  type ExpressionItemResult,
  ExpressionSubToken,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  MetricsViewerTabState,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";
import {
  getModifiedDefinition,
  toJsDefinition,
} from "../utils/definition-cache";
import { entryHasBreakout } from "../utils/definition-entries";
import { getTabConfig } from "../utils/tab-config";

export interface UseDefinitionQueriesResult {
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
  breakoutValuesBySourceId: Map<MetricSourceId, MetricBreakoutValuesResponse>;
  isExecuting: (id: MetricSourceId) => boolean;
  /**
   * Per-expression-item results. Empty when there are no expression items
   * (pure individual-metric mode). When non-empty the tab should render one
   * chart series per entry alongside any standalone individual-metric series.
   */
  expressionItems: ExpressionItemResult[];
}

// --- Expression parsing ---

type ParseCtx = {
  tokens: ExpressionSubToken[];
  pos: number;
  leafRefs: Map<number, unknown>;
};

function parseTerm(ctx: ParseCtx): unknown | null {
  if (ctx.pos >= ctx.tokens.length) {
    return null;
  }
  const token = ctx.tokens[ctx.pos];

  if (token.type === "metric") {
    const tokenPos = ctx.pos;
    ctx.pos++;
    return ctx.leafRefs.get(tokenPos) ?? null;
  }

  if (token.type === "constant") {
    ctx.pos++;
    return token.value;
  }

  if (token.type === "open-paren") {
    ctx.pos++;
    const expr = parseExpression(ctx);
    if (
      ctx.pos < ctx.tokens.length &&
      ctx.tokens[ctx.pos].type === "close-paren"
    ) {
      ctx.pos++;
    }
    return expr;
  }

  return null;
}

function parseExpression(ctx: ParseCtx): unknown | null {
  let left = parseTerm(ctx);
  if (!left) {
    return null;
  }

  while (
    ctx.pos < ctx.tokens.length &&
    ctx.tokens[ctx.pos].type === "operator"
  ) {
    const op = (ctx.tokens[ctx.pos] as { type: "operator"; op: MathOperator })
      .op;
    ctx.pos++;
    const right = parseTerm(ctx);
    if (!right) {
      return null;
    }
    left = [op, {}, left, right];
  }

  return left;
}

// ---

type DatasetRequest = {
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
  const { tokens, name } = entity;

  // Build leaf refs and projections for each metric occurrence in the expression.
  // Each occurrence gets its own unique UUID keyed by token position so the same
  // metric can appear multiple times (e.g. Revenue / Revenue).
  const leafRefs = new Map<number, unknown>();
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
    const modifiedDefinition = getModifiedDefinitionForTab(definition, tab);
    if (!modifiedDefinition) {
      if (!definition) {
        return null; // still loading the metric, not an error
      }
      return { error: `No compatible dimensions for ${name}` };
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

  // Parse token stream into nested expression tree
  const ctx: ParseCtx = { tokens, pos: 0, leafRefs };
  const expr = parseExpression(ctx);
  if (!expr) {
    return null;
  }

  return {
    modifiedDefinitions,
    definition: {
      expression: expr as JsMetricDefinition["expression"],
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

  for (const entity of formulaEntities) {
    if (isMetricEntry(entity)) {
      const modifiedDefinition = getModifiedDefinitionForTab(
        definitions[entity.id],
        tab,
      );

      if (!modifiedDefinition) {
        continue;
      }

      const jsDefinition = toJsDefinition(modifiedDefinition);
      datasetRequests.push({
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
  }

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
    return Object.values(definitions).flatMap((entry) => {
      if (!entry.definition || !entryHasBreakout(entry)) {
        return [];
      }

      const jsDefinition = toJsDefinition(entry.definition);

      return [
        {
          sourceId: entry.id,
          request: { definition: jsDefinition },
        },
      ];
    });
  }, [definitions]);

  const modifiedDefinitions = useMemo(() => {
    const map = new Map<MetricSourceId, MetricDefinition>();
    for (const { sourceId, modifiedDefinition } of datasetRequests) {
      map.set(sourceId, modifiedDefinition);
    }

    for (const expressionItem of expressionItemsConfig) {
      Object.entries(expressionItem.modifiedDefinitions).forEach(
        ([sourceId, modifiedDefinition]) => {
          map.set(sourceId as MetricSourceId, modifiedDefinition);
        },
      );
    }
    return map;
  }, [datasetRequests, expressionItemsConfig]);

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
      sourceId: query.sourceId,
      result: metricApi.endpoints.getMetricBreakoutValues.select(query.request)(
        state,
      ),
    })),
  );

  const { resultsByDefinitionId, errorsByDefinitionId, isExecuting } =
    useMemo(() => {
      const results = new Map<MetricSourceId, Dataset>();
      const errors = new Map<MetricSourceId, string>();
      const executing = new Set<MetricSourceId>();

      // In mixed/expression mode only populate results for standalone sources
      // so they don't bleed into the expression-series chart path.
      for (const { sourceId, result } of datasetResults) {
        if (result.data) {
          results.set(sourceId, result.data);
        }
        if (result.error) {
          errors.set(sourceId, getErrorMessage(result.error));
        }
        if (result.isLoading || ("isFetching" in result && result.isFetching)) {
          executing.add(sourceId);
        }
      }

      return {
        resultsByDefinitionId: results,
        errorsByDefinitionId: errors,
        isExecuting: (id: MetricSourceId) => executing.has(id),
      };
    }, [datasetResults]);

  const breakoutValuesBySourceId = useMemo(() => {
    const map = new Map<MetricSourceId, MetricBreakoutValuesResponse>();
    for (const { sourceId, result } of breakoutResults) {
      if (result.data) {
        map.set(sourceId, result.data);
      }
    }
    return map;
  }, [breakoutResults]);

  const expressionItems: ExpressionItemResult[] = useMemo(
    () => [
      ...expressionItemsConfig.map(({ entry }, idx) => {
        const queryResult = expressionItemQueryResults[idx];
        return {
          entry,
          result: queryResult?.data ?? null,
          isExecuting: queryResult?.isLoading ?? false,
          requestError: queryResult?.error
            ? getErrorMessage(queryResult.error)
            : null,
          expressionError: null,
        };
      }),
      ...expressionItemsErrors.map(({ entry, error }) => {
        return {
          entry,
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
    resultsByDefinitionId,
    errorsByDefinitionId,
    modifiedDefinitions,
    breakoutValuesBySourceId,
    isExecuting,
    expressionItems,
  };
}
