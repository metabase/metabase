import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { queryDrill } from "metabase/querying/drills/utils/query-drill";
import type { DrillThruDisplayInfo } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type {
  ClickAction,
  ClickObject,
  QueryClickActionsMode,
} from "../../types";

export class Mode {
  _question: Question;
  _queryMode: QueryClickActionsMode;
  _plugins?: SdkPluginsConfig;

  constructor(
    question: Question,
    queryMode: QueryClickActionsMode,
    plugins?: SdkPluginsConfig,
  ) {
    this._question = question;
    this._queryMode = queryMode;
    this._plugins = plugins;
  }

  queryMode() {
    return this._queryMode;
  }

  name() {
    return this._queryMode.name;
  }

  actionsForClick(
    clicked: ClickObject,
    settings: Record<string, any>,
    extraData?: Record<string, any>,
  ): ClickAction[] {
    // keeping try/catch here as MBQL was failing silently
    try {
      const mode = this._queryMode;
      const question = this._question;
      const props = { question, settings, clicked, extraData };

      let actions = [
        ...(mode.hasDrills
          ? queryDrill(question, clicked, this.isDrillEnabled)
          : []),
        ...(mode.clickActions?.flatMap(drill => drill(props)) ?? []),
      ];

      if (!actions.length && mode.fallback) {
        actions = mode.fallback(props);
      }

      if (this._plugins?.mapQuestionClickActions) {
        actions = this._plugins.mapQuestionClickActions(actions, {
          value: clicked.value,
          column: clicked.column,
          event: clicked.event,
          data: clicked.data,
        });
      }

      return actions;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  private isDrillEnabled = (drill: DrillThruDisplayInfo): boolean => {
    const mode = this._queryMode;

    if (mode.hasDrills && mode.availableOnlyDrills != null) {
      return mode.availableOnlyDrills.includes(drill.type);
    }

    return true;
  };
}
