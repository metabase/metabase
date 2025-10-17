import { transformClickedDataPoint } from "metabase/embedding-sdk/lib/transform-clicked";
import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
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
  _plugins?: MetabasePluginsConfig;

  constructor(
    question: Question,
    queryMode: QueryClickActionsMode,
    plugins?: MetabasePluginsConfig,
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
    const mode = this._queryMode;
    const question = this._question;
    const props = { question, settings, clicked, extraData };

    let actions = [
      ...(mode.hasDrills
        ? queryDrill(question, clicked, this.isDrillEnabled)
        : []),
      ...(mode.clickActions?.flatMap((drill) => drill(props)) ?? []),
    ];

    if (!actions.length && mode.fallback) {
      actions = mode.fallback(props);
    }

    if (this._plugins?.mapQuestionClickActions) {
      const actionsOrActionObject = this._plugins.mapQuestionClickActions(
        actions,
        transformClickedDataPoint(clicked, question),
      );

      if (Array.isArray(actionsOrActionObject)) {
        actions = actionsOrActionObject;
      } else if ("onClick" in actionsOrActionObject) {
        // If the plugin returns a single object, it means we should call that action right away without showing the popover
        // `performDefaultAction` checks if it only gets one action, and if it has `default: true`, it's called directly without showing the popover
        actions = [
          {
            // makes it run without showing the popover
            default: true,

            // fallback values in case they just return `{ onClick: () => {})`}
            section: "auto",
            type: "custom",
            buttonType: "horizontal",
            name: "default",

            ...(actionsOrActionObject as Partial<ClickAction>),
          },
        ];
      } else {
        console.warn(
          "mapQuestionClickActions should return an array of actions, or a single object with a `onClick` property",
        );
      }
    }

    return actions;
  }

  private isDrillEnabled = (drill: DrillThruDisplayInfo): boolean => {
    const mode = this._queryMode;

    if (mode.hasDrills && mode.availableOnlyDrills != null) {
      return mode.availableOnlyDrills.includes(drill.type);
    }

    return true;
  };
}
