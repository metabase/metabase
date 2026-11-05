import { groupBy, sortBy } from "es-toolkit";

import type { WritebackAction } from "metabase-types/api";

import type { ModelActionMap } from "./types";

export const sortAndGroupActions = (
  actions?: WritebackAction[],
): ModelActionMap => {
  if (!actions) {
    return {};
  }

  const sortedActions = sortBy(actions, [
    (a: WritebackAction) => a.name.toLowerCase(),
  ]);
  const sortedGroupedActions = groupBy(sortedActions, (item) =>
    String(item.model_id),
  );

  return sortedGroupedActions;
};
