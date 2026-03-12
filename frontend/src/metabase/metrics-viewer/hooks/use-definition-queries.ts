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

import { splitByItems } from "../components/MetricSearch/utils";
import type { ExpressionToken, MathOperator } from "../types/operators";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";
import {
  getModifiedDefinition,
  toJsDefinition,
} from "../utils/definition-cache";
import { entryHasBreakout } from "../utils/definition-entries";

/**
 * One entry per expression item in the token list (items separated by
 * separator tokens that contain at least one operator — i.e. not a plain
 * single-metric item).
 */
export type ExpressionItemResult = {
  /** The tokens that form this expression item (no separator tokens). */
  itemTokens: ExpressionToken[];
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
  /**
   * Source IDs of definitions that are plain single-metric items in the token
   * list. `null` means "pure individual mode" — all loaded definitions are
   * standalone and individual queries fire for all of them.
   */
  standaloneSourceIds: Set<MetricSourceId> | null;
}

// --- Expression parsing ---

type ParseCtx = {
  tokens: ExpressionToken[];
  pos: number;
  leafRefs: Map<number, unknown>;
};

function parseTerm(ctx: ParseCtx): unknown | null {
  if (ctx.pos >= ctx.tokens.length) {
    return null;
  }
  const token = ctx.tokens[ctx.pos];

  if (token.type === "metric") {
    ctx.pos++;
    return ctx.leafRefs.get(token.metricIndex) ?? null;
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

/**
 * Returns true when a single separator-delimited item's tokens form a valid
 * arithmetic expression: at least one metric, at least one operator, and
 * balanced parentheses.
 */
function isExpressionItem(itemTokens: ExpressionToken[]): boolean {
  const metricCount = itemTokens.filter((t) => t.type === "metric").length;
  const constantCount = itemTokens.filter((t) => t.type === "constant").length;
  const opCount = itemTokens.filter((t) => t.type === "operator").length;
  const openParens = itemTokens.filter((t) => t.type === "open-paren").length;
  const closeParens = itemTokens.filter((t) => t.type === "close-paren").length;
  return (
    metricCount >= 1 &&
    opCount >= 1 &&
    opCount === metricCount + constantCount - 1 &&
    openParens === closeParens
  );
}

function buildArithmeticRequest(
  datasetRequests: Array<{
    sourceId: MetricSourceId;
    modifiedDefinition: MetricDefinition;
  }>,
  definitions: MetricsViewerDefinitionEntry[],
  tokens: ExpressionToken[],
): { definition: JsMetricDefinition } | null {
  // Map metricIndex → datasetRequest (metricIndex = position in definitions)
  const indexToRequest = new Map<number, (typeof datasetRequests)[0]>();
  let idx = 0;
  for (const entry of definitions) {
    const req = datasetRequests.find((r) => r.sourceId === entry.id);
    if (req) {
      indexToRequest.set(idx, req);
    }
    idx++;
  }

  // Build leaf refs and projections for each unique metric index in the expression
  const leafRefs = new Map<number, unknown>();
  const projections: TypedProjection[] = [];

  for (const token of tokens) {
    if (token.type !== "metric") {
      continue;
    }
    if (leafRefs.has(token.metricIndex)) {
      continue;
    }
    const req = indexToRequest.get(token.metricIndex);
    if (!req) {
      return null; // metric not in a tab yet
    }

    const uuid = `leaf-${token.metricIndex}`;
    const metricId = LibMetric.sourceMetricId(req.modifiedDefinition);
    const measureId = LibMetric.sourceMeasureId(req.modifiedDefinition);

    if (metricId != null) {
      leafRefs.set(token.metricIndex, [
        "metric",
        { "lib/uuid": uuid },
        metricId,
      ]);
    } else if (measureId != null) {
      leafRefs.set(token.metricIndex, [
        "measure",
        { "lib/uuid": uuid },
        measureId,
      ]);
    } else {
      return null;
    }

    const jsdef = toJsDefinition(req.modifiedDefinition);
    if (jsdef.projections) {
      projections.push(...jsdef.projections);
    }
  }

  // Parse token stream into nested expression tree
  const ctx: ParseCtx = { tokens, pos: 0, leafRefs };
  const expr = parseExpression(ctx);
  if (!expr) {
    return null;
  }

  return {
    definition: {
      expression: expr as JsMetricDefinition["expression"],
      projections,
    },
  };
}

export function useDefinitionQueries(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState | null,
  tokens: ExpressionToken[] = [],
): UseDefinitionQueriesResult {
  const dispatch = useDispatch();

  const datasetRequests = useMemo(() => {
    if (!tab) {
      return [];
    }

    return definitions.flatMap((entry) => {
      const dimensionId = tab.dimensionMapping[entry.id];
      if (!dimensionId || !entry.definition) {
        return [];
      }

      const modifiedDefinition = getModifiedDefinition(
        entry.definition,
        dimensionId,
        tab.projectionConfig,
      );

      if (!modifiedDefinition) {
        return [];
      }

      const jsDefinition = toJsDefinition(modifiedDefinition);

      return [
        {
          sourceId: entry.id,
          modifiedDefinition,
          request: { definition: jsDefinition },
        },
      ];
    });
  }, [definitions, tab]);

  const breakoutRequests = useMemo(() => {
    return definitions.flatMap((entry) => {
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
    return map;
  }, [datasetRequests]);

  /**
   * Arithmetic requests, one per expression item.  Each entry carries the
   * original itemTokens (used downstream to build the series name) plus the
   * RTK-Query request payload (null when the expression cannot yet be built,
   * e.g. a required definition is not loaded yet).
   */
  const expressionItemsConfig = useMemo(() => {
    const items = splitByItems(tokens);
    return items
      .filter(
        (itemTokens) => itemTokens.length > 0 && isExpressionItem(itemTokens),
      )
      .map((itemTokens) => ({
        itemTokens,
        request: buildArithmeticRequest(
          datasetRequests,
          definitions,
          itemTokens,
        ),
      }));
  }, [datasetRequests, definitions, tokens]);

  /**
   * Source IDs of definitions that are referenced by plain single-metric
   * items (not part of any expression item).  `null` means pure-individual
   * mode: no expression items exist, so all loaded definitions are standalone.
   */
  const standaloneSourceIds = useMemo((): Set<MetricSourceId> | null => {
    const items = splitByItems(tokens);
    const hasExpressionItem = items.some(
      (itemTokens) => itemTokens.length > 0 && isExpressionItem(itemTokens),
    );

    if (!hasExpressionItem) {
      // Pure individual mode — caller uses all definitions.
      return null;
    }

    const ids = new Set<MetricSourceId>();
    for (const itemTokens of items) {
      if (itemTokens.length === 0 || isExpressionItem(itemTokens)) {
        continue;
      }
      for (const token of itemTokens) {
        if (token.type === "metric") {
          const entry = definitions[token.metricIndex];
          if (entry) {
            ids.add(entry.id);
          }
        }
      }
    }
    return ids;
  }, [tokens, definitions]);

  const isIndividualMode = expressionItemsConfig.length === 0;

  // Individual dataset queries:
  //   • pure individual mode → fire for every definition in the tab
  //   • mixed mode           → fire only for standalone metric items
  useEffect(() => {
    if (datasetRequests.length === 0) {
      return;
    }

    const requestsToFire = isIndividualMode
      ? datasetRequests
      : datasetRequests.filter(
          (r) => standaloneSourceIds?.has(r.sourceId) ?? false,
        );

    if (requestsToFire.length === 0) {
      return;
    }

    const subscriptions = requestsToFire.map((query) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(query.request)),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [datasetRequests, dispatch, isIndividualMode, standaloneSourceIds]);

  // Per-expression-item arithmetic queries
  useEffect(() => {
    const validRequests = expressionItemsConfig
      .map((item) => item.request)
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (validRequests.length === 0) {
      return;
    }

    const subscriptions = validRequests.map((req) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(req)),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [expressionItemsConfig, dispatch]);

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
    expressionItemsConfig.map(({ request }) => {
      if (!request) {
        return null;
      }
      return metricApi.endpoints.getMetricDataset.select(request)(state);
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
        if (!isIndividualMode && !standaloneSourceIds?.has(sourceId)) {
          continue;
        }
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
    }, [isIndividualMode, standaloneSourceIds, datasetResults]);

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
      expressionItemsConfig.map(({ itemTokens }, idx) => {
        const queryResult = expressionItemQueryResults[idx];
        return {
          itemTokens,
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
    standaloneSourceIds,
  };
}
