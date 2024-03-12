import { queryDrill } from "metabase/querying";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

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
    clicked: ClickObject,
    settings: VisualizationSettings,
    extraData?: Record<string, any>,
  ): ClickAction[] {
    const mode = this._queryMode;
    const question = this._question;
    const props = { question, clicked, settings, extraData };
    const actions = [
      ...(mode.hasDrills ? queryDrill(question, clicked, settings) : []),
      ...(mode.clickActions?.flatMap(drill => drill(props)) ?? []),
    ];

    if (!actions.length && mode.fallback) {
      return mode.fallback(props);
    } else {
      return actions;
    }
  }
}
