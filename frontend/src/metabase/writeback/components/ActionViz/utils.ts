import type { WritebackAction } from "metabase-types/api";

export const shouldShowConfirmation = (action?: WritebackAction) => {
  return (
    action &&
    (action.visualization_settings?.confirmMessage || action.slug === "delete")
  );
};
