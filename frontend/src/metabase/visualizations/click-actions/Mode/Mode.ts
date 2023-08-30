import * as Lib from "metabase-lib";
import { DRILL_TYPE_TO_HANDLER_MAP } from "metabase/visualizations/click-actions/Mode/constants";
import type { DrillThru } from "metabase-lib";
import type Question from "metabase-lib/Question";
import type {
  ClickAction,
  ClickObject,
  QueryClickActionsMode,
} from "../../types";

export class Mode {
  _question: Question;
  _queryMode: QueryClickActionsMode;

  constructor(question: Question, queryMode: QueryClickActionsMode) {
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
    extraData?: Record<string, any>,
  ): ClickAction[] {
    const mode = this._queryMode;
    const question = this._question;
    const props = { question, settings, clicked, extraData };

    const query = question._getMLv2Query();
    const stageIndex = -1;

    const availableDrillThrus = Lib.availableDrillThrus(
      query,
      stageIndex,
      clicked?.column,
      clicked?.value,
      clicked?.data,
      clicked?.dimensions,
    );

    const applyDrillAndGetNewQuestion = (drill: DrillThru, ...args: any[]) => {
      const query = question._getMLv2Query();
      const updatedQuery = Lib.drillThru(query, -1, drill, ...args);

      return question.setDatasetQuery(Lib.toLegacyQuery(updatedQuery));
    };

    const drills = availableDrillThrus
      .flatMap(drill => {
        const drillDisplayInfo = Lib.displayInfo(query, stageIndex, drill);

        const drillHandler = DRILL_TYPE_TO_HANDLER_MAP[drillDisplayInfo.type];

        if (!drillHandler) {
          return null;
        }

        return drillHandler({
          ...props,
          drill,
          drillDisplayInfo,
          applyDrill: applyDrillAndGetNewQuestion,
        });
      })
      .filter(Boolean) as ClickAction[]; // TODO: remove this after all handler types have been added

    const additionalClickActions =
      mode.clickActions?.flatMap(drill => drill(props)) || [];

    const actions = [...drills, ...additionalClickActions];

    if (!actions.length && mode.fallback) {
      return mode.fallback(props);
    } else {
      return actions;
    }
  }
}
