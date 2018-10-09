import _ from "underscore";

import Question from "metabase-lib/lib/Question";
import { getMode } from "metabase/qb/lib/modes";

import type {
  ClickAction,
  ClickObject,
  QueryMode,
} from "metabase/meta/types/Visualization";

export default class Mode {
  _question: Question;
  _queryMode: QueryMode;

  constructor(question: Question, queryMode: QueryMode) {
    this._question = question;
    this._queryMode = queryMode;
  }

  static forQuestion(question: Question): ?Mode {
    // TODO Atte Keinänen 6/22/17: Move getMode here and refactor it after writing tests
    const card = question.card();
    const tableMetadata = question.tableMetadata();
    const queryMode = getMode(card, tableMetadata);

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

  actions(settings): ClickAction[] {
    return _.flatten(
      this._queryMode.actions.map(actionCreator =>
        actionCreator({ question: this._question, settings }),
      ),
    );
  }

  actionsForClick(clicked: ?ClickObject, settings): ClickAction[] {
    return _.flatten(
      this._queryMode.drills.map(actionCreator =>
        actionCreator({ question: this._question, settings, clicked }),
      ),
    );
  }
}
