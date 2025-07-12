import type { StoryFn } from "@storybook/react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import "../metabase-provider.web-component";
import "./metabot-question.web-component";

const config = getStorybookSdkAuthConfigForUser("admin");
(window as any).fetchRequestToken = config.fetchRequestToken;

export default {
  title: "EmbeddingSDK/MetabotQuestion/web-component",
  component: "metabot-question",
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
export const MetabotQuestion = () => <metabot-question />;
