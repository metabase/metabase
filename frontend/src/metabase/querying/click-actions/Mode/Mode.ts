import { transformClickedDataPoint } from "metabase/embedding-sdk/lib/transform-clicked";
import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { queryDrill } from "metabase/querying/drills/utils/query-drill";
import type {
  ClickAction,
  ClickActionModeContext,
  ClickActionsMode,
  ClickObject,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
import type { DrillThruDisplayInfo } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { ClickActionProps } from "metabase-lib/v1/queries/drills/types";

type ModeOptions = {
  plugins?: MetabasePluginsConfig;
  hasColumnShortcutActions?: boolean;
};

export class Mode implements ClickActionsMode {
  private readonly _getQueryMode: (question: Question) => QueryClickActionsMode;
  private readonly _plugins?: MetabasePluginsConfig;

  hasColumnShortcutActions?: (props: ClickActionProps) => boolean;

  constructor(
    getQueryMode: (question: Question) => QueryClickActionsMode,
    { plugins, hasColumnShortcutActions = false }: ModeOptions = {},
  ) {
    this._getQueryMode = getQueryMode;
    this._plugins = plugins;

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

            // Unjustified type cast. FIXME
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
