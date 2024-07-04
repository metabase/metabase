import type { SdkClickActionPluginsConfig } from "embedding-sdk";

import { InteractiveQuestionProvider } from "../public/InteractiveQuestion/context";

import { InteractiveQuestionResult } from "./InteractiveQuestionResult";

interface InteractiveAdHocQuestionProps {
  questionId: number;
  onNavigateBack: () => void;

  withTitle?: boolean;
  height?: number;
  plugins?: SdkClickActionPluginsConfig;
}

export const InteractiveAdHocQuestion = ({
  questionId,
  onNavigateBack,
  withTitle = true,
  height,
  plugins,
}: InteractiveAdHocQuestionProps) => {
  return (
    <InteractiveQuestionProvider
      questionId={questionId}
      componentPlugins={plugins}
      onNavigateBack={onNavigateBack}
    >
      <InteractiveQuestionResult height={height} withTitle={withTitle} />
    </InteractiveQuestionProvider>
  );
};
