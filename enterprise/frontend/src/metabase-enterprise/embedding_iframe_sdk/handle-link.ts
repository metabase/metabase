import { MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN } from "embedding-sdk-shared/lib/sdk-global-plugins";
import type { SdkIframeEmbedTagMessage } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { listenForEajsMessages } from "metabase/embedding/embedding-iframe-sdk/utils/post-message";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export const initializeHandleLinkPlugin = () => {
  if (hasPremiumFeature("embedding_simple")) {
    MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN.handleLink = (url: string) => {
      return new Promise<{ handled: boolean }>((resolve) => {
        const requestId = crypto.randomUUID();
        let removeMessageListener = () => {};

        removeMessageListener = listenForEajsMessages({
          messageSource: "embed.js",
          handler: (message) => {
            if (
              message.type === "metabase.embed.handleLinkResponse" &&
              message.data.requestId === requestId
            ) {
              removeMessageListener();
              resolve({ handled: message.data.handled });
            }
          },
        });

        const handleLinkMessage: SdkIframeEmbedTagMessage = {
          type: "metabase.embed.handleLink",
          data: { url, requestId },
        };

        window.parent.postMessage(handleLinkMessage, "*");
      });
    };
  }
};
