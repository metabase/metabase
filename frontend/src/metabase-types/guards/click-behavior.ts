import type {
  BaseActionClickBehavior,
  DeleteActionClickBehavior,
  ImplicitActionClickBehavior,
  InsertActionClickBehavior,
  UpdateActionClickBehavior,
} from "metabase-types/api";

const isObject = (
  value: unknown,
): value is Record<string | number | symbol, unknown> => {
  return typeof value === "object" && value !== null;
};

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
