import * as INSPECTOR from "cljs/metabase.lib.transforms.inspector";
import type { InspectorLens, TransformInspectField } from "metabase-types/api";

export type TriggeredCondition = {
  name: string;
  card_id?: string;
  [key: string]: unknown;
};

export type TriggeredAlert = {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  condition: TriggeredCondition;
};

export type TriggeredDrillLens = {
  lens_id: string;
  params?: Record<string, unknown>;
  reason?: string;
  condition: TriggeredCondition;
};

type TriggerResult = {
  alerts: TriggeredAlert[];
  drillLenses: TriggeredDrillLens[];
};

export const interestingFields = (
  fields: TransformInspectField[],
  options?: { threshold?: number; limit?: number },
): Array<TransformInspectField & { interestingness: { score: number } }> => {
  return INSPECTOR.interestingFields(
    fields,
    options?.threshold,
    options?.limit,
  );
};

export const evaluateTriggers = (
  lens: InspectorLens,
  cardResults: Record<string, Record<string, unknown>>,
): TriggerResult => {
  return INSPECTOR.evaluateTriggers(lens, cardResults);
};
