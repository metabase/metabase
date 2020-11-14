import Question from "metabase-lib/lib/Question";
import { getMode } from "metabase/modes/lib/modes";

import type {
  ClickAction,
  ClickObject,
  QueryMode,
} from "metabase-types/types/Visualization";

export default class Mode {
  _question: Question;
  _queryMode: QueryMode;

  constructor(question: Question, queryMode: QueryMode) {
    this._question = question;
    this._queryMode = queryMode;
  }

  static forQuestion(question: Question): ?Mode {
    // TODO Atte Keinänen 6/22/17: Move getMode here and refactor it after writing tests
    const queryMode = getMode(question);

    if (queryMode) {
      return new Mode(question, queryMode);
    } else {
      return null;
    }
  }

  queryMode() {
    return this._queryMode;
  }

  name() {
    return this._queryMode.name;
  }

  actionsForClick(clicked: ?ClickObject, settings, extraData): ClickAction[] {
    return this._queryMode.drills().flatMap(actionCreator =>
      actionCreator({
        question: this._question,
        settings,
        clicked,
        extraData,
      }),
    );
  }
}
