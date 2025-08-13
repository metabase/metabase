import { getHostedBundleStoryDecorator } from "embedding-sdk/sdk-wrapper/test/getHostedBundleStoryDecorator";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { SdkQuestion } from "../SdkQuestion/SdkQuestion";

import { MetabaseProvider } from "./MetabaseProvider";

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/MetabaseProvider/public",
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

export const MultipleProviders = () => (
  <>
    <MetabaseProvider authConfig={config}>
      <SdkQuestion questionId={QUESTION_ID} />
    </MetabaseProvider>

    <MetabaseProvider authConfig={config}>
      <SdkQuestion questionId={QUESTION_ID + 1} />
    </MetabaseProvider>
  </>
);
