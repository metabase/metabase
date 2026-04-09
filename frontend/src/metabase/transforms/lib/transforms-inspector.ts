import * as INSPECTOR from "cljs/metabase.transforms_inspector.js";
import type {
  InspectorAlertTrigger,
  InspectorCard,
  InspectorCardId,
  InspectorDrillLensTrigger,
  InspectorField,
  InspectorLens,
  InspectorLensId,
  InspectorVisitedFields,
  RowValues,
  VisualizationDisplay,
} from "metabase-types/api";

type TriggerResult = {
  alerts: InspectorAlertTrigger[];
  drill_lenses: InspectorDrillLensTrigger[];
};

export type CardStats = Record<string, unknown>;

export const interestingFields = (
  fields: InspectorField[],
  visitedFields?: InspectorVisitedFields,
  options?: { threshold?: number; limit?: number },
): Array<InspectorField & { interestingness: { score: number } }> =>
  INSPECTOR.interestingFields(
    fields,
    visitedFields ?? null,
    options?.threshold,
    options?.limit,
  );

export const evaluateTriggers = (
  lens: InspectorLens,
  cardsStats: Record<InspectorCardId, CardStats>,
): TriggerResult => INSPECTOR.evaluateTriggers(lens, cardsStats);

export const computeCardStats = (
  lensId: InspectorLensId,
  card: InspectorCard,
  rows: RowValues[] | undefined,
): CardStats | null => INSPECTOR.computeCardResult(lensId, card, rows ?? []);

export type DegeneracyResult = {
  degenerate: boolean;
  reason: string | null;
};

export const isDegenerate = (
  cardId: InspectorCardId,
  displayType: VisualizationDisplay,
  cardsStats: Record<InspectorCardId, CardStats>,
): DegeneracyResult => INSPECTOR.isDegenerate(cardId, displayType, cardsStats);
