import type {
  BaseActionClickBehavior,
  DeleteActionClickBehavior,
  ImplicitActionClickBehavior,
  InsertActionClickBehavior,
  UpdateActionClickBehavior,
} from "metabase-types/api";

const isBaseActionClickBehavior = (
  value: unknown,
): value is BaseActionClickBehavior => {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "action" &&
    "actionType" in value &&
    typeof value.actionType === "string"
  );
};

const isInsertActionClickBehavior = (
  value: unknown,
): value is InsertActionClickBehavior => {
  return (
    isBaseActionClickBehavior(value) &&
    value.actionType === "insert" &&
    "tableId" in value &&
    value.tableId === "number"
  );
};

const isUpdateActionClickBehavior = (
  value: unknown,
): value is UpdateActionClickBehavior => {
  return (
    isBaseActionClickBehavior(value) &&
    value.actionType === "update" &&
    "objectDetailDashCardId" in value &&
    value.objectDetailDashCardId === "number"
  );
};

const isDeleteActionClickBehavior = (
  value: unknown,
): value is DeleteActionClickBehavior => {
  return (
    isBaseActionClickBehavior(value) &&
    value.actionType === "delete" &&
    "objectDetailDashCardId" in value &&
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
