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
    // If the plugin returns a single object, it means we should call that action right away without showing the popover
    // `performDefaultAction` checks if it only gets one action, and if it has `default: true`, it's called directly without showing the popover
    return [
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
  }

  console.warn(
    "mapQuestionClickActions should return an array of actions, or a single object with a `onClick` property",
  );

  return actions;
}
