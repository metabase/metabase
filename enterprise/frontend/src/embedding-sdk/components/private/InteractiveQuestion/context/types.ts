import type { PropsWithChildren } from "react";

import type { SdkPluginsConfig } from "embedding-sdk";
import type { LoadQuestionHookResult } from "embedding-sdk/hooks/private/use-load-question";
import type { LoadSdkQuestionParams } from "embedding-sdk/types/question";
import type { Mode } from "metabase/visualizations/click-actions/Mode";

export type InteractiveQuestionConfig = {
  componentPlugins?: SdkPluginsConfig;
  onNavigateBack?: () => void;
};

export type QuestionMockLocationParameters = {
  location: { search: string; hash: string; pathname: string };
  params: { slug?: string };
};

export type InteractiveQuestionProviderWithLocationProps = PropsWithChildren<
  InteractiveQuestionConfig & QuestionMockLocationParameters
>;

export type InteractiveQuestionProviderProps = PropsWithChildren<
  InteractiveQuestionConfig & LoadSdkQuestionParams
>;

export type InteractiveQuestionContextType = Omit<
  LoadQuestionHookResult,
  "loadQuestion"
> &
  Pick<InteractiveQuestionConfig, "onNavigateBack"> & {
    plugins: SdkPluginsConfig | null;
    mode: Mode | null | undefined;
    resetQuestion: () => void;
    onReset: () => void;
  };
