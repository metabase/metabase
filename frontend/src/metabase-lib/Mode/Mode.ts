import {
  ClickAction,
  ClickObject,
  QueryMode,
} from "metabase-types/types/Visualization";
import Question from "metabase-lib/Question";

export default class Mode {
  _question: Question;
  _queryMode: QueryMode;

  constructor(question: Question, queryMode: QueryMode) {
    this._question = question;
    this._queryMode = queryMode;
  }

  queryMode() {
    return this._queryMode;
  }

  name() {
    return this._queryMode.name;
  }

  actionsForClick(
    clicked: ClickObject | undefined,
    settings: Record<string, any>,
    extraData: Record<string, any>,
  ): ClickAction[] {
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
