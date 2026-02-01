import * as INSPECTOR from "cljs/metabase.lib.transforms.inspector";
import * as INSPECTOR_V2 from "cljs/metabase.lib.transforms.inspector_v2";
import type {
  InspectorCard,
  InspectorLens,
  TransformInspectField,
} from "metabase-types/api";

export type CardStats = {
  rowCount: number;
  firstRow?: unknown[];
  nullRate?: number;
  outputCount?: number;
  matchedCount?: number;
  nullCount?: number;
};

export type TriggeredCondition = {
  "card-id": string;
  field?: string | number | symbol;
  comparator: string;
  threshold: unknown;
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

type DegenerateResult = {
  degenerate: boolean;
  reason: string | null;
};

export const interestingFields = (
  fields: TransformInspectField[],
  options?: { threshold?: number; limit?: number },
): Array<TransformInspectField & { interestingness: { score: number } }> => {
  return INSPECTOR_V2.interestingFields(
    fields,
    options?.threshold,
    options?.limit,
  );
};

export const evaluateTriggers = (
  lens: InspectorLens,
  cardResults: Record<string, Record<string, unknown>>,
): TriggerResult => {
  return INSPECTOR_V2.evaluateTriggers(lens, cardResults);
};

export const checkDegenerate = (
  cardId: string,
  stats: CardStats,
  displayType: InspectorCard["display"],
  cardSummaries?: Record<string, CardStats>,
): DegenerateResult => {
  return INSPECTOR.checkDegenerate(cardId, stats, displayType, cardSummaries);
};
