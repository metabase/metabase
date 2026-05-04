import { createPlugin } from "metabase/lib/plugins-v2";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export const sdkMetabotNavigateToPlugin = createPlugin(
  "ee-sdk-metabot-navigate-to",
  ({ override }) => {
    // In the SDK we don't immediately route to the agent's `navigate_to`
    // target. Instead we defer it as a chart message that the action appends
    // to the conversation when the stream completes — that way the chart
    // renders below the agent's final text, not in the middle.
    override("metabot.navigateTo", ({ path, currentPending }) => {
      if (currentPending) {
        console.warn("Overwriting pending navigate_to: ", {
          previous: currentPending.navigateTo,
          next: path,
        });
      }
      return { type: "chart", navigateTo: path };
    });
  },
);

export const initializeSdkMetabotNavigateToPlugin = () => {
  if (hasPremiumFeature("embedding_sdk")) {
    sdkMetabotNavigateToPlugin.activate();
  }
};
