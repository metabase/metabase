import { useCallback, useRef } from "react";
import { useUnmount } from "react-use";

import type { UserBackendJwtResponse } from "embedding-sdk/types/refresh-token";
import { isWithinIframe } from "metabase/lib/dom";

import type {
  SdkIframeEmbedMessage,
  SdkIframeEmbedTagMessage,
} from "../types/embed";

/**
 * Requests a refresh token from the embed.js script
 * that lives in the parent window.
 */
export function useRequestRefreshTokenFromEmbedJs(): {
  requestRefreshToken: () => Promise<UserBackendJwtResponse>;
} {
  const handlerRef = useRef<
    ((event: MessageEvent<SdkIframeEmbedMessage>) => void) | null
  >(null);

  const requestRefreshToken = useCallback(() => {
    return new Promise<UserBackendJwtResponse>((resolve) => {
      if (handlerRef.current) {
        window.removeEventListener("message", handlerRef.current);
      }

      handlerRef.current = (event: MessageEvent<SdkIframeEmbedMessage>) => {
        if (!isWithinIframe() || !event.data) {
          return;
        }

        const action = event.data;

        if (action.type === "metabase.embed.submitRequestToken") {
          window.removeEventListener("message", handlerRef.current!);
          resolve(action.data.refreshToken);
        }
      };

      window.addEventListener("message", handlerRef.current!);

      const requestTokenMessage: SdkIframeEmbedTagMessage = {
        type: "metabase.embed.requestRefreshToken",
      };

      window.parent.postMessage(requestTokenMessage, "*");
    });
  }, []);

  useUnmount(() => {
    window.removeEventListener("message", handlerRef.current!);
  });

  return { requestRefreshToken };
}
