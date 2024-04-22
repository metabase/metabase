import type { SdkClickActionExtensionsConfig } from "embedding-sdk/lib/question-extensions";
import { queryDrill } from "metabase/querying";
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
  _extensions?: SdkClickActionExtensionsConfig;

  constructor(
    question: Question,
    queryMode: QueryClickActionsMode,
    extensions?: SdkClickActionExtensionsConfig,
  ) {
    this._question = question;
    this._queryMode = queryMode;
    this._extensions = extensions;
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
      ...(mode.clickActions?.flatMap(drill => drill(props)) ?? []),
    ];

    if (!actions.length && mode.fallback) {
      actions = mode.fallback(props);
    }

    if (this._extensions?.mapClickActions) {
      actions = this._extensions.mapClickActions(actions, {
        value: clicked.value,
        column: clicked.column,
        event: clicked.event,
        data: clicked.data,
      });
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
