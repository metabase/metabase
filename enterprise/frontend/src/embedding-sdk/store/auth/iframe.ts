import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import type { MetabaseEmbeddingSessionToken } from "embedding-sdk/types/refresh-token";
import api from "metabase/lib/api";
import { isWithinIframe } from "metabase/lib/dom";

import { authTokenStorage } from "./saml-token-storage";

export type IframeAuthConfig =
  | { type: "apiKey"; apiKey: string }
  | { type: "sso"; refreshToken: MetabaseEmbeddingSessionToken };

export type SimpleInteractivePostMessageAction = {
  type: "metabase.embed.authenticate";
  payload: IframeAuthConfig;
};

export function authenticateWithIframe(): {
  promise: Promise<IframeAuthConfig | null>;
  cleanup: () => void;
} {
  let messageHandler:
    | ((event: MessageEvent<SimpleInteractivePostMessageAction>) => void)
    | null = null;

  const promise = new Promise<IframeAuthConfig | null>((resolve, reject) => {
    messageHandler = (event) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      const action = event.data;

      if (action.type === "metabase.embed.authenticate") {
        if (action.payload.type === "sso") {
          if (!action.payload || !action.payload.refreshToken) {
            reject(new Error("invalid refresh token"));
            return;
          }

          const { refreshToken } = action.payload;
          authTokenStorage.set(refreshToken);
          api.sessionToken = refreshToken.id;
        }

        resolve(action.payload);
        window.removeEventListener("message", messageHandler!);
      }
    };

    window.addEventListener("message", messageHandler);

    window.parent.postMessage(
      {
        type: "metabase.embed.askToAuthenticate",
        payload: {
          sdkVersion: getEmbeddingSdkVersion(),
        },
      },
      "*",
    );
  });

  const cleanup = () => {
    if (messageHandler) {
      window.removeEventListener("message", messageHandler);
    }
  };

  return { promise, cleanup };
}
