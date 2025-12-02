import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

import { MetabaseProvider } from "../MetabaseProvider";

import { InteractiveQuestion } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/InteractiveQuestion/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <InteractiveQuestion questionId={QUESTION_ID} />
  </MetabaseProvider>
);

export const WithChildrenComponents = () => (
  <MetabaseProvider authConfig={config}>
    <InteractiveQuestion questionId={QUESTION_ID}>
      <InteractiveQuestion.Title />
      <InteractiveQuestion.QuestionSettings />
      <InteractiveQuestion.QuestionVisualization />
    </InteractiveQuestion>
  </MetabaseProvider>
);
