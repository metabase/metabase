import * as Lib from "metabase-lib";
import type { DrillThru } from "metabase-lib";
import type Question from "metabase-lib/Question";
import type {
  ClickAction,
  ClickObject,
  QueryClickActionsMode,
} from "../../types";
import { DRILL_TYPE_TO_HANDLER_MAP } from "./constants";

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

    let drills: ClickAction[] = [];

    // FIXME: this try catch is needed to mitigate Lib runtime error, it doesn't work properly with custom columns. Remove when this gets fixed
    try {
      const query = question._getMLv2Query();
      const stageIndex = -1;

      const applyDrillAndGetNewQuestion = (
        drill: DrillThru,
        ...args: any[]
      ) => {
        const updatedQuery = Lib.drillThru(query, stageIndex, drill, ...args);
        return question.setDatasetQuery(Lib.toLegacyQuery(updatedQuery));
      };

      // TODO: those calculations are really expensive and must be memoized at some level
      // check `_visualizationIsClickableCached` from TableInteractive
      const availableDrillThrus = Lib.availableDrillThrus(
        query,
        stageIndex,
        clicked?.column,
        clicked?.value,
        clicked?.data,
        clicked?.dimensions,
      );

      drills = availableDrillThrus
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
        .filter(Boolean) as ClickAction[]; // TODO [31004]: remove this after all drills have been added
    } catch (e) {
      console.error("error getting available drills from MLv2", e);
    }

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
