import type { ReactNode } from "react";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { MetabotQuestionProps } from "./types";

type MetabotQuestionComponent = ((props: MetabotQuestionProps) => ReactNode) & {
  schema?: FunctionSchema;
};

export const METABOT_SDK_EE_PLUGIN: {
  MetabotQuestion: MetabotQuestionComponent;
} = {
  // Placeholder implementation – replaced by EE plugin at runtime
  MetabotQuestion: ((_props: MetabotQuestionProps) =>
    null) as MetabotQuestionComponent,
};

export const MetabotQuestion = (props: MetabotQuestionProps) => {
  return <METABOT_SDK_EE_PLUGIN.MetabotQuestion {...props} />;
};
