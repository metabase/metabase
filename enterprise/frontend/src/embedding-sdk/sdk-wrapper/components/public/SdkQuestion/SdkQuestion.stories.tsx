import { getHostedBundleStoryDecorator } from "embedding-sdk/sdk-wrapper/test/getHostedBundleStoryDecorator";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { MetabaseProvider } from "../MetabaseProvider";

import { SdkQuestion } from "./SdkQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/SdkQuestion/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <SdkQuestion questionId={QUESTION_ID} />
  </MetabaseProvider>
);

export const WithChildrenComponents = () => (
  <MetabaseProvider authConfig={config}>
    <SdkQuestion questionId={QUESTION_ID}>
      <SdkQuestion.Title />
      <SdkQuestion.QuestionSettings />
      <SdkQuestion.QuestionVisualization />
    </SdkQuestion>
  </MetabaseProvider>
);
