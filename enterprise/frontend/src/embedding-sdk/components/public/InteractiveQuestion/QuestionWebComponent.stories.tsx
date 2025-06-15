import type { StoryFn } from "@storybook/react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import "./web";

// Shared configuration
const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/WebComponent/Question",
  component: "mb-question",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story: StoryFn) => (
      <mb-provider
        metabase-instance-url={config.metabaseInstanceUrl}
        fetch-request-token="fetchRequestToken"
      >
        <Story />
      </mb-provider>
    ),
  ],
};

export const Question = () => <mb-question question-id={QUESTION_ID} />;
Question.args = {};

export const Open = () => <mb-question-open question-id={QUESTION_ID} />;

export const Closed = () => <mb-question-closed question-id={QUESTION_ID} />;
