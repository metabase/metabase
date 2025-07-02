import { useEffect, useRef } from "react";
import { useSearchParam } from "react-use";

import { useSetting } from "metabase/common/hooks";
import { Box } from "metabase/ui";
import type { MetabaseEmbed } from "metabase-enterprise/embedding_iframe_sdk/embed";

import { useSdkIframeEmbedSetupContext } from "../context";
import { DEFAULT_SDK_IFRAME_EMBED_SETTINGS } from "../utils/default-embed-setting";

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
  const localeOverride = useSearchParam("locale");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = `${instanceUrl}/app/embed.js`;
    document.body.appendChild(script);

    script.onload = () => {
      const { MetabaseEmbed } = window["metabase.embed"];

      embedJsRef.current = new MetabaseEmbed({
        ...DEFAULT_SDK_IFRAME_EMBED_SETTINGS,

        instanceUrl,
        target: "#iframe-embed-container",
        iframeClassName: S.EmbedPreviewIframe,
        useExistingUserSession: true,

        ...(localeOverride ? { locale: localeOverride } : {}),
      });
    };

    return () => {
      embedJsRef.current?.destroy();
      script.remove();
    };
  }, [instanceUrl, localeOverride]);

  useEffect(() => {
    if (embedJsRef.current) {
      embedJsRef.current.updateSettings({
        // Clear the existing experiences.
        // This is necessary as `updateSettings` merges new settings with existing ones.
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
