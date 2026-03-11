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

export interface UseDefinitionQueriesResult {
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
  breakoutValuesBySourceId: Map<MetricSourceId, MetricBreakoutValuesResponse>;
  isExecuting: (id: MetricSourceId) => boolean;
  arithmeticResult: Dataset | null;
  arithmeticIsExecuting: boolean;
  arithmeticError: string | null;
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

  // Arithmetic mode: valid expression with ≥2 metrics, balanced parens
  const arithmeticRequest = useMemo(() => {
    const metricCount = tokens.filter((t) => t.type === "metric").length;
    const opCount = tokens.filter((t) => t.type === "operator").length;
    const openParens = tokens.filter((t) => t.type === "open-paren").length;
    const closeParens = tokens.filter((t) => t.type === "close-paren").length;

    if (
      metricCount < 2 ||
      opCount !== metricCount - 1 ||
      openParens !== closeParens ||
      datasetRequests.length < 2
    ) {
      return null;
    }

    return buildArithmeticRequest(datasetRequests, definitions, tokens);
  }, [datasetRequests, definitions, tokens]);

  const isArithmeticMode = arithmeticRequest !== null;

  // Individual dataset queries — skipped in arithmetic mode
  useEffect(() => {
    if (datasetRequests.length === 0 || isArithmeticMode) {
      return;
    }

    const subscriptions = datasetRequests.map((query) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(query.request)),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [datasetRequests, dispatch, isArithmeticMode]);

  // Arithmetic combined query
  useEffect(() => {
    if (!arithmeticRequest) {
      return;
    }

    const subscription = dispatch(
      metricApi.endpoints.getMetricDataset.initiate(arithmeticRequest),
    );

    return () => subscription.unsubscribe();
  }, [arithmeticRequest, dispatch]);

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

  const arithmeticQueryResult = useSelector((state: State) => {
    if (!arithmeticRequest) {
      return null;
    }
    return metricApi.endpoints.getMetricDataset.select(arithmeticRequest)(
      state,
    );
  });

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
      if (isArithmeticMode) {
        return {
          resultsByDefinitionId: new Map<MetricSourceId, Dataset>(),
          errorsByDefinitionId: new Map<MetricSourceId, string>(),
          isExecuting: (_id: MetricSourceId) => false,
        };
      }

      const results = new Map<MetricSourceId, Dataset>();
      const errors = new Map<MetricSourceId, string>();
      const executing = new Set<MetricSourceId>();

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
    }, [isArithmeticMode, datasetResults]);

  const breakoutValuesBySourceId = useMemo(() => {
    const map = new Map<MetricSourceId, MetricBreakoutValuesResponse>();
    for (const { sourceId, result } of breakoutResults) {
      if (result.data) {
        map.set(sourceId, result.data);
      }
    }
    return map;
  }, [breakoutResults]);

  return {
    resultsByDefinitionId,
    errorsByDefinitionId,
    modifiedDefinitions,
    breakoutValuesBySourceId,
    isExecuting,
    arithmeticResult: arithmeticQueryResult?.data ?? null,
    arithmeticIsExecuting: arithmeticQueryResult?.isLoading ?? false,
    arithmeticError: arithmeticQueryResult?.error
      ? getErrorMessage(arithmeticQueryResult.error)
      : null,
  };
}
