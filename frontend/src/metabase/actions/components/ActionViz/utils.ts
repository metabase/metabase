import type { WritebackAction } from "metabase-types/api";

export const shouldShowConfirmation = (action?: WritebackAction) => {
  if (!action) {
    return false;
  }
  const hasConfirmationMessage = action.visualization_settings?.confirmMessage;
  const isImplicitDelete =
    action.type === "implicit" && action.kind === "row/delete";
  return hasConfirmationMessage || isImplicitDelete;
};
