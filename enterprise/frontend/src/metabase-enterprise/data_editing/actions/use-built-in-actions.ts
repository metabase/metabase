import { useMemo } from "react";

import type { EditableTableActionsDisplaySettings } from "metabase-types/api";

export const useBuiltInActions = (
  actionsVizSettings: EditableTableActionsDisplaySettings[] | undefined,
) => {
  return useMemo(() => {
    let hasCreateAction = false;
    let hasDeleteAction = false;
    let hasUpdateAction = true;

    actionsVizSettings?.forEach((action) => {
      if (action.actionId === "data-grid.row/create" && action.enabled) {
        hasCreateAction = true;
      }
      if (action.actionId === "data-grid.row/delete" && action.enabled) {
        hasDeleteAction = true;
      }
      if (action.actionId === "data-grid.row/update" && !action.enabled) {
        hasUpdateAction = false;
      }
    });

    return {
      hasCreateAction,
      hasDeleteAction,
      hasUpdateAction,
    };
  }, [actionsVizSettings]);
};
