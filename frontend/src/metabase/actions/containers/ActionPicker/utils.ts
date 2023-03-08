import type { WritebackAction } from "metabase-types/api";

import type { ModelActionMap } from "./types";

export const groupActionsByModelId = (actions?: WritebackAction[]) => {
  if (!actions) {
    return {};
  }

  return actions.reduce(
    (modelsMap: ModelActionMap, action: WritebackAction) => {
      if (!modelsMap[action.model_id]) {
        modelsMap[action.model_id] = [];
      }
      modelsMap[action.model_id].push(action);
      return modelsMap;
    },
    {},
  );
};

export const sortGroupedActions = (groupedActions: ModelActionMap) => {
  // sort actions by name within each model
  Object.keys(groupedActions)
    .map(Number) // all keys are strings, but we need numbers
    .forEach(modelId => {
      groupedActions[modelId].sort((a: WritebackAction, b: WritebackAction) =>
        a.name.localeCompare(b.name),
      );
    });

  return groupedActions;
};
