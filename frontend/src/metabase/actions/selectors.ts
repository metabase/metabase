import { getMetadata } from "metabase/selectors/metadata";

import type { WritebackActionBase, QueryAction } from "metabase-types/api";
import type { State } from "metabase-types/store";
import Question from "metabase-lib/Question";

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
      visualization_settings: action.visualization_settings,
    },
    getMetadata(state),
  ).setParameters(action.parameters);
}
