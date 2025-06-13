import { useEffect, useRef } from "react";

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
  const context = useSdkIframeEmbedSetupContext();
  const { settings } = context.options;

  const embedJsRef = useRef<MetabaseEmbed | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/app/embed.js";
    document.body.appendChild(script);

    script.onload = () => {
      const { MetabaseEmbed } = window["metabase.embed"];

      embedJsRef.current = new MetabaseEmbed({
        dashboardId: 1,
        instanceUrl: settings.instanceUrl,

        // This is an invalid API key.
        // The embed uses the admin's session if the provided API key is invalid.
        apiKey: "invalid-api-key-for-embed-preview",

        target: "#iframe-embed-container",
        iframeClassName: S.EmbedPreviewIframe,
      });
    };

    return () => {
      embedJsRef.current?.destroy();
      script.remove();
    };
  }, [settings.instanceUrl]);

  useEffect(() => {
    embedJsRef.current?.updateSettings(settings);
  }, [settings]);

  return (
    <div>
      <Box id="iframe-embed-container" />
    </div>
  );
};
