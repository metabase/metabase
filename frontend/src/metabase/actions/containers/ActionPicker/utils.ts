import _ from "underscore";

import type { TableAction, WritebackAction } from "metabase-types/api";

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

export const sortAndGroupTableActions = (actions?: TableAction[]) => {
  if (!actions) {
    return {};
  }

  const sortedActions = _.sortBy(actions, (a) => a.table_name.toLowerCase());

  const sortedGroupedActions = _.groupBy(sortedActions, "table_name");

  return sortedGroupedActions;
};
