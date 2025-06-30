import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { MetabaseProvider } from "../MetabaseProvider";

import { InteractiveQuestion } from "./InteractiveQuestion";

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/InteractiveQuestion/public",
  parameters: {
    layout: "fullscreen",
  },
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <InteractiveQuestion questionId={QUESTION_ID} />
  </MetabaseProvider>
);
