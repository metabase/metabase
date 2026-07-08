import { MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN } from "embedding-sdk-shared/lib/sdk-global-plugins";
import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export const initializeHandleLinkPlugin = () => {
  if (hasPremiumFeature("embedding_simple")) {
    MODULAR_EMBEDDING_HANDLE_LINK_PLUGIN.handleLink = (url: string) => {
      return new Promise<{ handled: boolean }>((resolve) => {
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
            resolve({ handled: action.data.handled });
          }
        };

        window.addEventListener("message", handler);

        const handleLinkMessage: SdkIframeEmbedTagMessage = {
          type: "metabase.embed.handleLink",
          data: { url, requestId },
        };

        window.parent.postMessage(handleLinkMessage, "*");
      });
    };
  }
};
