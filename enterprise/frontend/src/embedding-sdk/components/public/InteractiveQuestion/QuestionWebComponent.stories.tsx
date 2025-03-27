import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";
import "./web";

// Shared configuration
const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");
window.fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/WebComponent/Question",
  component: "mb-question",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    Story => (
      <mb-provider
        metabase-instance-url={config.metabaseInstanceUrl}
        auth-provider-uri={config.authProviderUri}
        fetch-request-token="fetchRequestToken"
      >
        <Story />
      </mb-provider>
    ),
  ],
};

export const Question = args => <mb-question question-id={QUESTION_ID} />;
Question.args = {};

export const Open = args => <mb-question-open question-id={QUESTION_ID} />;

export const Closed = args => <mb-question-closed question-id={QUESTION_ID} />;
