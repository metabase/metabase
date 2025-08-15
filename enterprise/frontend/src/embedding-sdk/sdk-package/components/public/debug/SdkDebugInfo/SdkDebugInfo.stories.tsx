import { getHostedBundleStoryDecorator } from "embedding-sdk/sdk-package/test/getHostedBundleStoryDecorator";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk/test/CommonSdkStoryWrapper";

import { MetabaseProvider } from "../../MetabaseProvider";

import { SdkDebugInfo } from "./SdkDebugInfo";

const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/SdkDebugInfo/public",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [getHostedBundleStoryDecorator()],
};

const checkSizePx = 40;
export const Default = () => (
  <div
    style={{
      width: "100vw",
      height: "100vh",
      backgroundImage:
        "linear-gradient(45deg, #ccc 26%, transparent 26%)," +
        "linear-gradient(135deg, #ccc 26%, transparent 26%)," +
        "linear-gradient(45deg, transparent 75%, #ccc 75%)," +
        "linear-gradient(135deg, transparent 75%, #ccc 75%)",
      backgroundSize: `${checkSizePx * 2}px ${checkSizePx * 2}px`,
      backgroundPosition: `0 0, ${checkSizePx}px 0, ${checkSizePx}px -${checkSizePx}px, 0px ${checkSizePx}px`,
    }}
  >
    <MetabaseProvider authConfig={config}>
      <SdkDebugInfo />
    </MetabaseProvider>
  </div>
);
