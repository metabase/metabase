import { transformClickedDataPoint } from "metabase/embedding-sdk/lib/transform-clicked";
import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { Mode } from "metabase/querying/click-actions/Mode";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";
import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

export function getEmbeddingMode({
  queryMode,
  plugins,
}: {
  queryMode: QueryClickActionsMode;
  plugins?: MetabasePluginsConfig;
}): ClickActionsMode {
  return new Mode(() => queryMode, {
    mapActions: (actions, clicked, question) =>
      applyClickActionsPlugin(plugins, actions, clicked, question),
  });
}

function applyClickActionsPlugin(
  plugins: MetabasePluginsConfig | undefined,
  actions: ClickAction[],
  clicked: ClickObject,
  question: Question,
): ClickAction[] {
  if (!plugins?.mapQuestionClickActions) {
    return actions;
  }

  const actionsOrActionObject = plugins.mapQuestionClickActions(
    actions,
    transformClickedDataPoint(clicked, question),
  );

  if (Array.isArray(actionsOrActionObject)) {
    return actionsOrActionObject;
  }

  if ("onClick" in actionsOrActionObject) {
    // When a click yields exactly one action and it has `default: true`, performDefaultAction runs it instead of showing the popover.
    return [
      {
        default: true,
        section: "auto",
        type: "custom",
        buttonType: "horizontal",
        name: "default",

        // Unjustified type cast. FIXME
        ...(actionsOrActionObject as Partial<ClickAction>),
      },
    ];
  }

  console.warn(
    "mapQuestionClickActions should return an array of actions, or a single object with a `onClick` property",
  );

  return actions;
}
