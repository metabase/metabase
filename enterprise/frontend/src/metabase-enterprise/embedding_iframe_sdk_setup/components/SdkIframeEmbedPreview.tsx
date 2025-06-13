import { useEffect } from "react";

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
  const context = useSdkIframeEmbedSetupContext();
  const instanceUrl = useSetting("site-url");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/app/embed.js";
    document.body.appendChild(script);

    let embed: MetabaseEmbed;

    script.onload = () => {
      const { MetabaseEmbed } = window["metabase.embed"];

      embed = new MetabaseEmbed({
        target: "#iframe-embed-container",
        instanceUrl,

        // This is an invalid API key.
        // The embed uses the admin's session if the provided API key is invalid.
        apiKey: "invalid-api-key-for-embed-preview",
        iframeClassName: S.EmbedPreviewIframe,

        ...context.options.settings,
      });
    };

    return () => {
      embed.destroy();
      script.remove();
    };
  });

  return (
    <div>
      <Box id="iframe-embed-container" />
    </div>
  );
};
