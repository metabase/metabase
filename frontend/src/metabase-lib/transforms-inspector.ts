import * as INSPECTOR from "cljs/metabase.transforms.inspector.js";
import type {
  InspectorCard,
  InspectorLens,
  TransformInspectField,
} from "metabase-types/api";

export type TriggeredCondition = {
  name: string;
  card_id: string;
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
  drill_lenses: TriggeredDrillLens[];
};

export type CardStats = Record<string, unknown>;

type VisitedFields = Record<string, unknown>;

export const interestingFields = (
  fields: TransformInspectField[],
  visitedFields?: VisitedFields,
  options?: { threshold?: number; limit?: number },
): Array<TransformInspectField & { interestingness: { score: number } }> =>
  INSPECTOR.interestingFields(
    fields,
    visitedFields ?? null,
    options?.threshold,
    options?.limit,
  );

export const evaluateTriggers = (
  lens: InspectorLens,
  cardsStats: Record<string, CardStats>,
): TriggerResult => INSPECTOR.evaluateTriggers(lens, cardsStats);

export const computeCardStats = (
  lensId: string,
  card: InspectorCard,
  rows: unknown[][] | undefined,
): CardStats | null => INSPECTOR.computeCardResult(lensId, card, rows ?? []);

export type DegeneracyResult = {
  degenerate: boolean;
  reason: string | null;
};

export const isDegenerate = (
  cardId: string,
  displayType: string,
  cardsStats: Record<string, CardStats>,
): DegeneracyResult => INSPECTOR.isDegenerate(cardId, displayType, cardsStats);
