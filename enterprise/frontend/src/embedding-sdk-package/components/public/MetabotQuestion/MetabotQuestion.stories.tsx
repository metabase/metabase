import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

import { MetabaseProvider } from "../MetabaseProvider";

import { MetabotQuestion } from "./MetabotQuestion";

const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/MetabotQuestion/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};
export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <MetabotQuestion />
  </MetabaseProvider>
);
