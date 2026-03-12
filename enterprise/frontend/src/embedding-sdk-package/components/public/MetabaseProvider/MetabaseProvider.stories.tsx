import { StrictMode } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { InteractiveQuestion } from "embedding-sdk-package/components/public/InteractiveQuestion/InteractiveQuestion";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

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
    <InteractiveQuestion questionId={QUESTION_ID} />
  </MetabaseProvider>
);

export const WithStrictMode = () => (
  <StrictMode>
    <MetabaseProvider authConfig={config}>
      <InteractiveQuestion questionId={QUESTION_ID} />
    </MetabaseProvider>
  </StrictMode>
);

export const MultipleProviders = () => (
  <>
    <MetabaseProvider authConfig={config}>
      <InteractiveQuestion questionId={QUESTION_ID} />
    </MetabaseProvider>

    <MetabaseProvider authConfig={config}>
      <InteractiveQuestion questionId={QUESTION_ID + 1} />
    </MetabaseProvider>
  </>
);

export const MissingProvider = () => (
  <InteractiveQuestion questionId={QUESTION_ID} />
);
