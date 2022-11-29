import { getSetting } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";

import type { WritebackActionBase, QueryAction } from "metabase-types/api";
import type { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

export function getWritebackEnabled(state: State) {
  return getSetting(state, "experimental-enable-actions");
}

export function createQuestionFromAction(
  state: State,
  action: WritebackActionBase & QueryAction,
) {
  return new Question(
    {
      id: action.id,
      name: action.name,
      description: action.description,
      dataset_query: action.dataset_query,
    },
    getMetadata(state),
  ).setParameters(action.parameters);
}
