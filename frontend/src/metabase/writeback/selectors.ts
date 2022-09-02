import Question from "metabase-lib/lib/Question";
import { getSetting } from "metabase/selectors/settings";
import { getMetadata } from "metabase/selectors/metadata";

import type { State } from "metabase-types/store";
import type { WritebackQueryAction } from "./types";

export function getWritebackEnabled(state: State) {
  return getSetting(state, "experimental-enable-actions");
}

export function createQuestionFromAction(
  state: State,
  action: WritebackQueryAction,
) {
  return new Question(action.card, getMetadata(state)).setParameters(
    action.parameters,
  );
}
