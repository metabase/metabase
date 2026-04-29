import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { createPlugin } from "metabase/lib/plugins-v2";
import { hasPremiumFeature } from "metabase-enterprise/settings";

function askParentToHandleLink(url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const requestId = crypto.randomUUID();

    const handler = (event: MessageEvent<SdkIframeEmbedMessage>) => {
      if (!event.data) {
        return;
      }

      const action = event.data;

      if (
        action.type === "metabase.embed.handleLinkResponse" &&
        action.data.requestId === requestId
      ) {
        window.removeEventListener("message", handler);
        resolve(action.data.handled);
      }
    };

    window.addEventListener("message", handler);

    const handleLinkMessage: SdkIframeEmbedTagMessage = {
      type: "metabase.embed.handleLink",
      data: { url, requestId },
    };

    window.parent.postMessage(handleLinkMessage, "*");
  });
}

const eajsOpenLinkPlugin = createPlugin("ee-eajs-open-link", ({ extend }) => {
  extend("dashboard.openLink", async (next, { url }) => {
    const handled = await askParentToHandleLink(url);
    if (!handled) {
      return next({ url });
    }
  });
});

export const initializeHandleLinkPlugin = () => {
  if (hasPremiumFeature("embedding_simple")) {
    eajsOpenLinkPlugin.activate();
  }
};
