import type { ReactNode } from "react";

import { useTrackSdkComponentMount } from "embedding-sdk-bundle/analytics/component-events";
import { useReportComponentReady } from "embedding-sdk-bundle/analytics/component-signals";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsLoggedIn } from "embedding-sdk-bundle/store/selectors";
import type { UseMetabotResult } from "embedding-sdk-bundle/types/metabot";
import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";
import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";

import type { MetabotQuestionProps } from "./types";

type MetabotQuestionComponent = ((props: MetabotQuestionProps) => ReactNode) & {
  schema?: FunctionSchema;
};

export const METABOT_SDK_EE_PLUGIN: {
  MetabotQuestion: MetabotQuestionComponent;
  MetabotProvider: ({ children }: { children: ReactNode }) => ReactNode;
  useMetabot: () => UseMetabotResult | null;
} = {
  // Placeholder implementation – replaced by EE plugin at runtime
  MetabotQuestion: ((_props: MetabotQuestionProps) =>
    null) as MetabotQuestionComponent,
  MetabotProvider: ({ children }: { children: ReactNode }) => children,
  useMetabot: () => null,
};

export const MetabotQuestion = (props: MetabotQuestionProps) => {
  const isLoggedIn = useSdkSelector(getIsLoggedIn);
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();

  useTrackSdkComponentMount("MetabotQuestion", null, {
    layout: props.layout,
  });

  // Wait until settings have loaded (login complete) before signaling an
  // error — useMetabotEnabledEmbeddingAware returns false while settings
  // are still loading, which would cause a premature error signal.
  const isConfigError = isLoggedIn && !isMetabotEnabled;

  // Error signal: fires here (outer component) when Metabot is not enabled.
  // Ready signal: fires in MetabotChatInput (inner EE component) once the
  // chat input mounts and the layout is known.
  useReportComponentReady({
    component: "MetabotQuestion",
    isReady: false,
    isError: isConfigError,
    errorType: isConfigError ? "config_error" : undefined,
  });

  return <METABOT_SDK_EE_PLUGIN.MetabotQuestion {...props} />;
};
