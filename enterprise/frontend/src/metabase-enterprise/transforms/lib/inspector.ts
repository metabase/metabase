import * as INSPECTOR_V2 from "cljs/metabase.lib.transforms.inspector_v2";
import type {
  InspectorV2Lens,
  TransformInspectField,
} from "metabase-types/api";

/**
 * Filter and sort fields by interestingness.
 * Returns fields with score above threshold, sorted by score descending.
 */
export function interestingFields(
  fields: TransformInspectField[],
  options?: { threshold?: number; limit?: number },
): Array<TransformInspectField & { interestingness: { score: number } }> {
  return INSPECTOR_V2.interestingFields(
    fields,
    options?.threshold,
    options?.limit,
  );
}

type TriggeredDrillLens = {
  lens_id: string;
  params?: Record<string, unknown>;
  reason?: string;
};

type TriggerResult = {
  alerts: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    message: string;
  }>;
  drillLenses: TriggeredDrillLens[];
};

/**
 * Evaluate all triggers for a lens against card results.
 */
export function evaluateTriggers(
  lens: InspectorV2Lens,
  cardResults: Record<string, Record<string, unknown>>,
): TriggerResult {
  return INSPECTOR_V2.evaluateTriggers(lens, cardResults);
}
