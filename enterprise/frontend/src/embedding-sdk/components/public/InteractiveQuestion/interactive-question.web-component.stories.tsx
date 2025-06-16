import type { StoryFn } from "@storybook/react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import "../metabase-provider.web-component";
import "./interactive-question.web-component";

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/web-component",
  component: "interactive-question",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story: StoryFn) => (
      <metabase-provider
        metabase-instance-url={config.metabaseInstanceUrl}
        fetch-request-token="fetchRequestToken"
      >
        <Story />
      </metabase-provider>
    ),
  ],
};

export const Question = () => (
  <interactive-question question-id={QUESTION_ID} />
);
Question.args = {};
