import { getHostedBundleStoryDecorator } from "embedding-sdk-bundle/sdk-package/test/getHostedBundleStoryDecorator";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";

import { MetabaseProvider } from "../MetabaseProvider";

import { CreateQuestion } from "./CreateQuestion";

const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/CreateQuestion/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

export const Default = () => (
  <MetabaseProvider authConfig={config}>
    <CreateQuestion />
  </MetabaseProvider>
);
