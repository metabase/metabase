import type { ReactNode } from "react";

import type { MetabotQuestionProps } from "metabase/embedding/sdk-bundle/types/metabot-question";
import type { FunctionSchema } from "metabase/embedding/sdk-bundle/types/schema";

type MetabotQuestionComponent = ((props: MetabotQuestionProps) => ReactNode) & {
  schema?: FunctionSchema;
};

function getDefaultMetabotSdkEePlugin() {
  return {
    // Placeholder implementation – replaced by EE plugin at runtime
    MetabotQuestion: ((_props: MetabotQuestionProps) =>
      null) as MetabotQuestionComponent,
    MetabotProvider: ({ children }: { children: ReactNode }) => children,
  };
}

export const METABOT_SDK_EE_PLUGIN = getDefaultMetabotSdkEePlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(METABOT_SDK_EE_PLUGIN, getDefaultMetabotSdkEePlugin());
}
