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
      mapQuestionClickActions(plugins, actions, clicked, question),
  });
}

function mapQuestionClickActions(
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
    // performDefaultAction runs a lone action carrying `default: true` without opening the popover,
    // so a single returned object becomes that one action.
    return [
      {
        default: true,

        // Fallback fields for a bare `{ onClick }` return.
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
