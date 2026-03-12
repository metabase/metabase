import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

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

const checkboardSquareSizePx = 40;
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
      backgroundSize: `${checkboardSquareSizePx * 2}px ${checkboardSquareSizePx * 2}px`,
      backgroundPosition: `0 0, ${checkboardSquareSizePx}px 0, ${checkboardSquareSizePx}px -${checkboardSquareSizePx}px, 0px ${checkboardSquareSizePx}px`,
    }}
  >
    <MetabaseProvider authConfig={config}>
      <SdkDebugInfo />
    </MetabaseProvider>
  </div>
);
