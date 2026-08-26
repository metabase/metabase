import type {
  BaseActionClickBehavior,
  ClickBehavior,
  DeleteActionClickBehavior,
  ImplicitActionClickBehavior,
  InsertActionClickBehavior,
  UpdateActionClickBehavior,
} from "metabase-types/api";

import { isObject } from "./common";

const isBaseActionClickBehavior = (
  value: unknown,
): value is BaseActionClickBehavior => {
  return (
    isObject(value) &&
    "type" in value &&
    value.type === "action" &&
    typeof value.actionType === "string"
  );
};

const isInsertActionClickBehavior = (
  value: unknown,
): value is InsertActionClickBehavior => {
  return (
    // TODO: Remove the next line when TypeScript is upgraded to 4.9+
    // @see https://devblogs.microsoft.com/typescript/announcing-typescript-4-9/#in-narrowing
    isObject(value) &&
    isBaseActionClickBehavior(value) &&
    value.actionType === "insert" &&
    value.tableId === "number"
  );
};

const isUpdateActionClickBehavior = (
  value: unknown,
): value is UpdateActionClickBehavior => {
  return (
    // TODO: Remove the next line when TypeScript is upgraded to 4.9+
    // @see https://devblogs.microsoft.com/typescript/announcing-typescript-4-9/#in-narrowing
    isObject(value) &&
    isBaseActionClickBehavior(value) &&
    value.actionType === "update" &&
    value.objectDetailDashCardId === "number"
  );
};

const isDeleteActionClickBehavior = (
  value: unknown,
): value is DeleteActionClickBehavior => {
  return (
    // TODO: Remove the next line when TypeScript is upgraded to 4.9+
    // @see https://devblogs.microsoft.com/typescript/announcing-typescript-4-9/#in-narrowing
    isObject(value) &&
    isBaseActionClickBehavior(value) &&
    value.actionType === "delete" &&
    value.objectDetailDashCardId === "number"
  );
};

export const isImplicitActionClickBehavior = (
  value: unknown,
): value is ImplicitActionClickBehavior => {
  return (
    isInsertActionClickBehavior(value) ||
    isUpdateActionClickBehavior(value) ||
    isDeleteActionClickBehavior(value)
  );
};

// Whether a click behavior is fully configured (a null behavior opens the
// default drill-through menu, so it counts as valid).
export function clickBehaviorIsValid(
  clickBehavior: ClickBehavior | undefined | null,
): boolean {
  // opens drill-through menu
  if (clickBehavior == null) {
    return true;
  }

  if (clickBehavior.type === "crossfilter") {
    return Object.keys(clickBehavior.parameterMapping || {}).length > 0;
  }

  if (clickBehavior.type === "action") {
    return isImplicitActionClickBehavior(clickBehavior);
  }

  if (clickBehavior.type === "link") {
    const { linkType } = clickBehavior;

    if (linkType === "url") {
      return (clickBehavior.linkTemplate || "").length > 0;
    }

    if (linkType === "dashboard" || linkType === "question") {
      return clickBehavior.targetId != null;
    }
  }

  // we've picked "link" without picking a link type
  return false;
}
