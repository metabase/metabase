import type {
  MetricSourceId,
  MetricsViewerFormulaEntity,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";

/**
 * A metric slot represents a single position in the formula where a metric
 * needs a dimension assignment.  Standalone metrics produce one slot each;
 * expression entities produce one slot per metric token (so the same metric
 * appearing twice in an expression creates two separate slots).
 *
 * The `slotIndex` is used as the key in `dimensionMapping`.
 */
export type MetricSlot = {
  /** Sequential index — used as the dimensionMapping key. */
  slotIndex: number;
  /** Which formulaEntities entry this slot belongs to. */
  entityIndex: number;
  /** The metric's source id (e.g. "metric:42"). */
  sourceId: MetricSourceId;
  /**
   * For expression-token slots, the index within `entity.tokens`.
   * `undefined` for standalone metric slots.
   */
  tokenPosition?: number;
};

/**
 * Walk `formulaEntities` and produce a flat list of metric slots.
 * The returned array's indices equal each slot's `slotIndex`.
 */
export function computeMetricSlots(
  formulaEntities: MetricsViewerFormulaEntity[],
): MetricSlot[] {
  const slots: MetricSlot[] = [];

  for (let i = 0; i < formulaEntities.length; i++) {
    const entity = formulaEntities[i];

    if (isMetricEntry(entity)) {
      slots.push({
        slotIndex: slots.length,
        entityIndex: i,
        sourceId: entity.id,
      });
    } else if (isExpressionEntry(entity)) {
      for (let j = 0; j < entity.tokens.length; j++) {
        const token = entity.tokens[j];
        if (token.type === "metric") {
          slots.push({
            slotIndex: slots.length,
            entityIndex: i,
            sourceId: token.sourceId,
            tokenPosition: j,
          });
        }
      }
    }
  }

  return slots;
}

/** Find the slot for a standalone metric at the given entity index. */
export function findStandaloneSlot(
  slots: MetricSlot[],
  entityIndex: number,
): MetricSlot | undefined {
  return slots.find(
    (s) => s.entityIndex === entityIndex && s.tokenPosition === undefined,
  );
}

/** Find the slot for an expression token at the given entity + token position. */
export function findExpressionTokenSlot(
  slots: MetricSlot[],
  entityIndex: number,
  tokenPosition: number,
): MetricSlot | undefined {
  return slots.find(
    (s) => s.entityIndex === entityIndex && s.tokenPosition === tokenPosition,
  );
}

/** Get all slots belonging to a given entity index. */
export function slotsForEntity(
  slots: MetricSlot[],
  entityIndex: number,
): MetricSlot[] {
  return slots.filter((s) => s.entityIndex === entityIndex);
}
