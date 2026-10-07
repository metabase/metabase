import _ from "underscore";

import type { WritebackAction } from "metabase-types/api";

import type { ModelActionMap } from "./types";

export const sortAndGroupActions = (
  actions?: WritebackAction[],
): ModelActionMap => {
  if (!actions) {
    return {};
  }

  const sortedActions = _.sortBy(actions, (a: WritebackAction) =>
    a.name.toLowerCase(),
  );
  const sortedGroupedActions = _.groupBy(sortedActions, "model_id");

  return sortedGroupedActions;
};

export const getSortedActionsWithoutModel = (
  actions: WritebackAction[],
): WritebackAction[] =>
  _.sortBy(
    actions.filter((action) => action.model_id == null),
    (action) => action.name.toLowerCase(),
  );
