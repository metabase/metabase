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
  ExpressionSubToken,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  MetricsViewerTabState,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";
import {
  getModifiedDefinition,
  toJsDefinition,
} from "../utils/definition-cache";
import { entryHasBreakout } from "../utils/definition-entries";

/**
 * One entry per expression definition in the formulaEntities list.
 */
export type ExpressionItemResult = {
  /** The expression definition entry. */
  entry: ExpressionDefinitionEntry;
  result: Dataset | null;
  isExecuting: boolean;
  error: string | null;
};

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

function buildArithmeticRequest(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  tab: MetricsViewerTabState,
  tokens: ExpressionSubToken[],
): {
  definition: JsMetricDefinition;
  modifiedDefinitions: {
    [sourceId: MetricSourceId]: MetricDefinition;
  };
} | null {
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

    const dimensionId = tab.dimensionMapping[token.sourceId];
    const definition = definitions[token.sourceId]?.definition;
    if (!dimensionId || !definition) {
      return null; // metric not in a tab yet
    }

    const modifiedDefinition = getModifiedDefinition(
      definition,
      dimensionId,
      tab.projectionConfig,
    );

    if (!modifiedDefinition) {
      return null;
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
} {
  if (!tab) {
    return {
      datasetRequests: [],
      expressionItemsConfig: [],
    };
  }

  const datasetRequests: DatasetRequest[] = [];
  const expressionItemsConfig: ExpressionItemConfig[] = [];

  for (const entity of formulaEntities) {
    if (isMetricEntry(entity)) {
      const dimensionId = tab.dimensionMapping[entity.id];
      const definition = definitions[entity.id]?.definition;
      if (!dimensionId || !definition) {
        continue;
      }

      const modifiedDefinition = getModifiedDefinition(
        definition,
        dimensionId,
        tab.projectionConfig,
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
      const requestData = buildArithmeticRequest(
        definitions,
        tab,
        entity.tokens,
      );

      if (requestData) {
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
  };
}

export function useDefinitionQueries(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  formulaEntities: MetricsViewerFormulaEntity[],
  tab: MetricsViewerTabState | null,
): UseDefinitionQueriesResult {
  const dispatch = useDispatch();

  const { datasetRequests, expressionItemsConfig } = useMemo(
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
    () =>
      expressionItemsConfig.map(({ entry }, idx) => {
        const queryResult = expressionItemQueryResults[idx];
        return {
          entry,
          result: queryResult?.data ?? null,
          isExecuting: queryResult?.isLoading ?? false,
          error: queryResult?.error ? getErrorMessage(queryResult.error) : null,
        };
      }),
    [expressionItemsConfig, expressionItemQueryResults],
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
