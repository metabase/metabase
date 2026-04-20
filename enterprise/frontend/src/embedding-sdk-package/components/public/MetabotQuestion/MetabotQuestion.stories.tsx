import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";
import {
  MOCK_AD_HOC_QUESTION_ID,
  mockStreamResponse,
} from "embedding-sdk-shared/test/mocks/mock-metabot-response";

import { MetabaseProvider } from "../MetabaseProvider";

import { MetabotQuestion } from "./MetabotQuestion";

const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/MetabotQuestion/public",
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        mockStreamResponse([
          { type: "text-start", id: "t1" },
          {
            type: "text-delta",
            id: "t1",
            delta: `Here is the [question link](${MOCK_AD_HOC_QUESTION_ID})`,
          },
          { type: "text-end", id: "t1" },
          { type: "data-navigate_to", id: "d1", data: MOCK_AD_HOC_QUESTION_ID },
        ]),
      ],
    },
  },
  decorators: [getHostedBundleStoryDecorator()],
};
export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <MetabotQuestion />
  </MetabaseProvider>
);
