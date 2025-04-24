import { useEffect, useState } from "react";

import { isWithinIframe } from "metabase/lib/dom";

export type IframeAuthConfig =
  | { type: "apiKey"; apiKey: string }
  | { type: "sso" }; // TODO: to be implemented once the new SSO implementation on the SDK is ready

export type SimpleInteractivePostMessageAction = {
  type: "metabase.embed.authenticate";
  payload: IframeAuthConfig;
};

export function useSdkInteractiveEmbedAuth() {
  const [iframeAuthConfig, setAuthConfig] = useState<IframeAuthConfig | null>(
    null,
  );

  useEffect(() => {
    const messageHandler = (
      event: MessageEvent<SimpleInteractivePostMessageAction>,
    ) => {
      if (!isWithinIframe() || !event.data) {
        return;
      }

      const action = event.data;

      if (action.type === "metabase.embed.authenticate") {
        setAuthConfig(action.payload);
      }
    };

    window.addEventListener("message", messageHandler);

    window.parent.postMessage(
      { type: "metabase.embed.askToAuthenticate" },
      "*",
    );

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  });

  return { iframeAuthConfig };
}
