import { b64url_to_utf8, utf8_to_b64url } from "metabase/utils/encoding";
import type {
  MathOperator,
  SegmentId,
  TemporalUnit,
  VisualizationSettings,
} from "metabase-types/api";

import { defineCompactSchema } from "./compact-schema";
import type {
  DimensionFilterValue,
  MetricsViewerDimensionBreakoutType,
  MetricsViewerDisplayType,
} from "./types";

function reviveFilter(filter: DimensionFilterValue): DimensionFilterValue {
  if (filter.type === "specific-date" || filter.type === "time") {
    return {
      ...filter,
      values: filter.values.map((value) =>
        typeof value === "string" ? new Date(value) : value,
      ),
    };
  } else if (filter.type === "number" || filter.type === "coordinate") {
    return {
      ...filter,
      values: filter.values.map((value) =>
        typeof value === "string" ? BigInt(value) : value,
      ),
    };
  }
  return filter;
}

/**
 * When we deserialize an entity, we can't apply breakouts or filters until the definition has loaded.
 * So we store them and apply them lazily after the definition has loaded.
 */
export interface SerializedDefinitionInfo {
  breakout?: string;
  breakoutTemporalUnit?: TemporalUnit;
  breakoutBinning?: string;
  filters?: SerializedUrlFilter[];
  segments?: SegmentId[];
}

// ── Serialized types (internal, URL-facing) ──

export interface SerializedExpressionSubToken {
  type: "metric" | "constant" | "operator" | "open-paren" | "close-paren";
  sourceId?: string;
  op?: MathOperator;
  value?: number;
  filters?: SerializedUrlFilter[];
  segments?: SegmentId[];
}

export interface SerializedExpressionEntry {
  type: "expression";
  id: string;
  name: string;
  tokens: SerializedExpressionSubToken[];
}

export interface SerializedUrlFilter {
  dimensionId: string;
  value: DimensionFilterValue;
}

export interface SerializedSource {
  type: "metric" | "measure";
  id: number;
  breakout?: string;
  breakoutTemporalUnit?: TemporalUnit;
  breakoutBinning?: string;
  filters?: SerializedUrlFilter[];
  segments?: SegmentId[];
}

export type SerializedFormulaEntity =
  | SerializedExpressionEntry
  | SerializedSource;

export interface SerializedDimensionBreakoutDef {
  slotIndex: number;
  dimensionId?: string;
}

export interface SerializedProjectionConfig {
  dimensionFilter?: DimensionFilterValue;
  temporalUnit?: TemporalUnit;
  binning?: string;
}

export interface SerializedDimensionBreakout {
  id: string;
  type: MetricsViewerDimensionBreakoutType;
  label: string | null;
  display: MetricsViewerDisplayType;
  showColumnLabels?: boolean;
  visualizationSettings?: Partial<VisualizationSettings>;
  definitions: SerializedDimensionBreakoutDef[];
  projectionConfig?: SerializedProjectionConfig;
}

export interface SerializedMetricsViewerPageState {
  formulaEntities: SerializedFormulaEntity[];
  dimensionBreakouts: SerializedDimensionBreakout[];
  selectedDimensionBreakoutId: string | null;
  showColumnLabels?: boolean;
}

// ── Compact schemas ──

const sourceFilterSchema = defineCompactSchema<SerializedUrlFilter>({
  dimensionId: "d",
  value: { key: "v" },
});

const expressionSubTokenSchema =
  defineCompactSchema<SerializedExpressionSubToken>({
    type: "t",
    sourceId: { key: "s", optional: true },
    op: { key: "o", optional: true },
    value: { key: "v", optional: true },
    filters: { key: "F", schema: sourceFilterSchema, optional: true },
    segments: { key: "S", optional: true },
  });

const formulaEntitySchema = defineCompactSchema<SerializedFormulaEntity>({
  type: "t",
  id: "i",
  breakout: { key: "b", optional: true },
  breakoutTemporalUnit: { key: "u", optional: true },
  breakoutBinning: { key: "B", optional: true },
  filters: { key: "F", schema: sourceFilterSchema, optional: true },
  segments: { key: "s", optional: true },
  name: { key: "n", optional: true },
  tokens: { key: "T", schema: expressionSubTokenSchema, optional: true },
});

const dimensionBreakoutDefSchema =
  defineCompactSchema<SerializedDimensionBreakoutDef>({
    slotIndex: "i",
    dimensionId: { key: "d", optional: true },
  });

const projectionConfigSchema = defineCompactSchema<SerializedProjectionConfig>({
  dimensionFilter: { key: "f", optional: true },
  temporalUnit: { key: "u", optional: true },
  binning: { key: "b", optional: true },
});

const dimensionBreakoutSchema =
  defineCompactSchema<SerializedDimensionBreakout>({
    id: "i",
    type: "t",
    label: { key: "l", default: null },
    display: { key: "d", default: "line" },
    showColumnLabels: { key: "c", optional: true },
    visualizationSettings: { key: "V", optional: true },
    definitions: {
      key: "D",
      schema: dimensionBreakoutDefSchema,
      default: [],
    },
    projectionConfig: {
      key: "p",
      schema: projectionConfigSchema,
      optional: true,
    },
  });

const rootSchema = defineCompactSchema<SerializedMetricsViewerPageState>({
  formulaEntities: { key: "f", schema: formulaEntitySchema, default: [] },
  dimensionBreakouts: {
    key: "t",
    schema: dimensionBreakoutSchema,
    default: [],
  },
  selectedDimensionBreakoutId: { key: "a", default: null },
  showColumnLabels: { key: "c", optional: true },
});

// ── Encode / decode ──

function emptyState(): SerializedMetricsViewerPageState {
  return {
    formulaEntities: [],
    dimensionBreakouts: [],
    selectedDimensionBreakoutId: null,
    showColumnLabels: false,
  };
}

// After JSON.parse, Date values are ISO strings. Walk the decoded state and revive them.
function reviveStateDates(
  state: SerializedMetricsViewerPageState,
): SerializedMetricsViewerPageState {
  return {
    ...state,
    formulaEntities: state.formulaEntities.map((entity) => {
      if ("filters" in entity && entity.filters) {
        return {
          ...entity,
          filters: entity.filters.map((filter) => ({
            ...filter,
            value: reviveFilter(filter.value),
          })),
        };
      }
      if ("tokens" in entity && entity.tokens) {
        return {
          ...entity,
          tokens: entity.tokens.map((token) => {
            if ("filters" in token && token.filters) {
              return {
                ...token,
                filters: token.filters.map((filter) => ({
                  ...filter,
                  value: reviveFilter(filter.value),
                })),
              };
            }
            return token;
          }),
        };
      }
      return entity;
    }),
    dimensionBreakouts: state.dimensionBreakouts.map((dimensionBreakout) =>
      dimensionBreakout.projectionConfig?.dimensionFilter
        ? {
            ...dimensionBreakout,
            projectionConfig: {
              ...dimensionBreakout.projectionConfig,
              dimensionFilter: reviveFilter(
                dimensionBreakout.projectionConfig.dimensionFilter,
              ),
            },
          }
        : dimensionBreakout,
    ),
  };
}

export function encodeState(
  state: SerializedMetricsViewerPageState,
): string | undefined {
  try {
    return utf8_to_b64url(
      JSON.stringify(rootSchema.compact(state), (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    );
  } catch (err) {
    console.error("Failed to encode metrics viewer URL state:", err);
    return undefined;
  }
}

export function decodeState(hash: string): SerializedMetricsViewerPageState {
  if (!hash) {
    return emptyState();
  }

  try {
    const state =
      rootSchema.expand(JSON.parse(b64url_to_utf8(hash))) ?? emptyState();
    return reviveStateDates(state);
  } catch (err) {
    console.warn("Failed to decode metrics viewer URL state:", err);
    return emptyState();
  }
}
