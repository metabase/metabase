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
  drillLenses: TriggeredDrillLens[];
};

export type CardStats = Record<string, unknown>;

const kebabToSnakeCase = (str: string): string => str.replace(/-/g, "_");
const snakeToKebabCase = (str: string): string => str.replace(/_/g, "-");

const convertKeysToSnakeCase = (obj: CardStats | null): CardStats | null => {
  if (obj === null) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [kebabToSnakeCase(key), value]),
  );
};

const convertKeysToKebabCase = (obj: CardStats): CardStats => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [snakeToKebabCase(key), value]),
  );
};

const convertCardsStatsToKebabCase = (
  cardsStats: Record<string, CardStats>,
): Record<string, CardStats> => {
  return Object.fromEntries(
    Object.entries(cardsStats).map(([cardId, stats]) => [
      cardId,
      convertKeysToKebabCase(stats),
    ]),
  );
};

export const interestingFields = (
  fields: TransformInspectField[],
  options?: { threshold?: number; limit?: number },
): Array<TransformInspectField & { interestingness: { score: number } }> =>
  INSPECTOR.interestingFields(fields, options?.threshold, options?.limit);

export const evaluateTriggers = (
  lens: InspectorLens,
  cardsStats: Record<string, CardStats>,
): TriggerResult =>
  INSPECTOR.evaluateTriggers(lens, convertCardsStatsToKebabCase(cardsStats));

export const computeCardStats = (
  lensId: string,
  card: InspectorCard,
  rows: unknown[][] | undefined,
): CardStats | null =>
  convertKeysToSnakeCase(INSPECTOR.computeCardResult(lensId, card, rows ?? []));

export type DegeneracyResult = {
  degenerate: boolean;
  reason: string | null;
};

export const isDegenerate = (
  cardId: string,
  displayType: string,
  cardsStats: Record<string, CardStats>,
): DegeneracyResult =>
  INSPECTOR.isDegenerate(cardId, displayType, convertCardsStatsToKebabCase(cardsStats));
