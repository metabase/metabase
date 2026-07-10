import type {
  GoalForeignColumnRef,
  GoalSelfColumnRef,
  GoalStaticValue,
  GoalValue,
} from "metabase-types/api";

import { isObject } from "./common";

export function isGoalStaticValue(value: unknown): value is GoalStaticValue {
  return typeof value === "number";
}

export function isGoalSelfColumnRef(
  value: unknown,
): value is GoalSelfColumnRef {
  return typeof value === "string";
}

export function isGoalForeignColumnRef(
  value: unknown,
): value is GoalForeignColumnRef {
  return (
    isObject(value) &&
    typeof value.card_id === "number" &&
    typeof value.column === "string"
  );
}

export function isGoalValue(value: unknown): value is GoalValue {
  return (
    isGoalStaticValue(value) ||
    isGoalSelfColumnRef(value) ||
    isGoalForeignColumnRef(value)
  );
}
