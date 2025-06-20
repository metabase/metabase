import { useEffect, useRef } from "react";

import { useSetting } from "metabase/common/hooks";
import { Box } from "metabase/ui";
import type { MetabaseEmbed } from "metabase-enterprise/embedding_iframe_sdk/embed";

import { useSdkIframeEmbedSetupContext } from "../context";

import S from "./SdkIframeEmbedSetup.module.css";

declare global {
  interface Window {
    "metabase.embed": { MetabaseEmbed: typeof MetabaseEmbed };
  }
}

export const SdkIframeEmbedPreview = () => {
  const { settings } = useSdkIframeEmbedSetupContext();
  const instanceUrl = useSetting("site-url");

  const embedJsRef = useRef<MetabaseEmbed | null>(null);

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
    };

    return () => {
      embedJsRef.current?.destroy();
      script.remove();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings are updated in the useEffect below
  }, [instanceUrl]);

  useEffect(() => {
    if (embedJsRef.current) {
      embedJsRef.current.updateSettings({
        template: undefined,
        questionId: undefined,
        dashboardId: undefined,

        ...settings,
      });
    }
  }, [settings]);

  return (
    <div>
      <Box id="iframe-embed-container" />
    </div>
  );
};
