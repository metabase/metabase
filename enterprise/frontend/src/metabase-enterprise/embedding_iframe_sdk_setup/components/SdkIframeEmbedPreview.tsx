import { useEffect, useRef, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { Box } from "metabase/ui";
import type { MetabaseEmbed } from "metabase-enterprise/embedding_iframe_sdk/embed";

import S from "./SdkIframeEmbedSetup.module.css";
import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

declare global {
  interface Window {
    "metabase.embed": { MetabaseEmbed: typeof MetabaseEmbed };
  }
}

export const SdkIframeEmbedPreview = () => {
  const { settings } = useSdkIframeEmbedSetupContext();
  const instanceUrl = useSetting("site-url");

  const embedJsRef = useRef<MetabaseEmbed | null>(null);
  const [isEmbedReady, setIsEmbedReady] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/app/embed.js";
    document.body.appendChild(script);

    script.onload = () => {
      const { MetabaseEmbed } = window["metabase.embed"];

      embedJsRef.current = new MetabaseEmbed({
        ...settings,
        instanceUrl,

        // This is an invalid API key.
        // The embed uses the admin's session if the provided API key is invalid.
        apiKey: "invalid-api-key-for-embed-preview",

        target: "#iframe-embed-container",
        iframeClassName: S.EmbedPreviewIframe,
      });

      embedJsRef.current.addEventListener("ready", () => setIsEmbedReady(true));
    };

    return () => {
      embedJsRef.current?.destroy();
      script.remove();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings are updated in the useEffect below
  }, [instanceUrl]);

  useEffect(() => {
    if (isEmbedReady && embedJsRef.current) {
      embedJsRef.current.updateSettings({
        template: undefined,
        questionId: undefined,
        dashboardId: undefined,

        ...settings,
      });
    }
  }, [settings, isEmbedReady]);

  return (
    <div>
      <Box id="iframe-embed-container" />
    </div>
  );
};
