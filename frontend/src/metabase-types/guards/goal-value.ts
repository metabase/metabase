import type {
  GoalSelfColumnReference,
  GoalSource,
  GoalStaticValue,
  GoalValue,
} from "metabase-types/api";

import { isObject } from "./common";

export function isGoalStaticValue(value: unknown): value is GoalStaticValue {
  return typeof value === "number";
}

export function isGoalSelfColumnReference(
  value: unknown,
): value is GoalSelfColumnReference {
  return typeof value === "string";
}

export function isGoalSource(value: unknown): value is GoalSource {
  return (
    isObject(value) &&
    typeof value.card_id === "number" &&
    typeof value.column === "string"
  );
}

export function isGoalValue(value: unknown): value is GoalValue {
  return (
    isGoalStaticValue(value) ||
    isGoalSelfColumnReference(value) ||
    isGoalSource(value)
  );
}
