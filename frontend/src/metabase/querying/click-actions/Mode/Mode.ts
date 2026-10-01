import { queryDrill } from "metabase/querying/drills/utils/query-drill";
import type {
  ClickAction,
  ClickActionModeContext,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import type { DrillThruDisplayInfo } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { ClickActionProps } from "metabase-lib/v1/queries/drills/types";

import type { QueryClickActionsMode } from "../types";

type MapClickActions = (
  actions: ClickAction[],
  clicked: ClickObject,
  question: Question,
) => ClickAction[];

type ModeOptions = {
  mapActions?: MapClickActions;
  hasColumnShortcutActions?: boolean;
};

export class Mode implements ClickActionsMode {
  _getQueryMode: (question: Question) => QueryClickActionsMode;
  _mapActions?: MapClickActions;

  hasColumnShortcutActions?: (props: ClickActionProps) => boolean;

  constructor(
    getQueryMode: (question: Question) => QueryClickActionsMode,
    { mapActions, hasColumnShortcutActions }: ModeOptions = {},
  ) {
    this._getQueryMode = getQueryMode;
    this._mapActions = mapActions;

    if (hasColumnShortcutActions) {
      this.hasColumnShortcutActions = (props) =>
        this._getQueryMode(props.question).clickActions.some(
          (action) => action(props)?.length > 0,
        );
    }
  }

  actionsForClick(
    clicked: ClickObject,
    { question, settings }: ClickActionModeContext = {},
  ): ClickAction[] {
    if (!question) {
      return [];
    }

    const mode = this._getQueryMode(question);
    const props = { question, settings, clicked };

    let actions = [
      ...(mode.hasDrills
        ? queryDrill(question, clicked, (drill) => isDrillEnabled(mode, drill))
        : []),
      ...mode.clickActions.flatMap((drill) => drill(props)),
    ];

    if (!actions.length && mode.fallback) {
      actions = mode.fallback(props);
    }

    return this._mapActions
      ? this._mapActions(actions, clicked, question)
      : actions;
  }
}

function isDrillEnabled(
  mode: QueryClickActionsMode,
  drill: DrillThruDisplayInfo,
): boolean {
  if (mode.hasDrills && mode.availableOnlyDrills != null) {
    return mode.availableOnlyDrills.includes(drill.type);
  }

  return true;
}
