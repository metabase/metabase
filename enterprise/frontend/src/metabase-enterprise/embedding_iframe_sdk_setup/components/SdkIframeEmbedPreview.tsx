import { useEffect, useRef } from "react";
import { useSearchParam } from "react-use";

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
  const { settings, isEmbedSettingsLoaded } = useSdkIframeEmbedSetupContext();

  const embedJsRef = useRef<MetabaseEmbed | null>(null);
  const localeOverride = useSearchParam("locale");
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(
    () => {
      if (isEmbedSettingsLoaded) {
        const script = document.createElement("script");

        script.src = `${settings.instanceUrl}/app/embed.js`;
        document.body.appendChild(script);

        script.onload = () => {
          const { MetabaseEmbed } = window["metabase.embed"];

          embedJsRef.current = new MetabaseEmbed({
            ...settings,
            target: "#iframe-embed-container",
            iframeClassName: S.EmbedPreviewIframe,
            useExistingUserSession: true,
            ...(localeOverride ? { locale: localeOverride } : {}),
          });
        };

        scriptRef.current = script;
      }

      return () => {
        embedJsRef.current?.destroy();
        scriptRef.current?.remove();
      };
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings are synced via useEffect below
    [isEmbedSettingsLoaded],
  );

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
