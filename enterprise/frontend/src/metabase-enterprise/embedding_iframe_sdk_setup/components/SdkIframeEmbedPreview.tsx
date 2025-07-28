import { useEffect, useRef, useState } from "react";
import { useSearchParam } from "react-use";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";
import { Card } from "metabase/ui";
import type { MetabaseEmbed } from "metabase-enterprise/embedding_iframe_sdk/embed";

import { useSdkIframeEmbedSetupContext } from "../context";

import S from "./SdkIframeEmbedSetup.module.css";

declare global {
  interface Window {
    "metabase.embed": { MetabaseEmbed: typeof MetabaseEmbed };
  }
}

export const SdkIframeEmbedPreview = () => {
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);

  const { settings, isEmbedSettingsLoaded } = useSdkIframeEmbedSetupContext();

  const embedJsRef = useRef<MetabaseEmbed | null>(null);
  const localeOverride = useSearchParam("locale");
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const instanceUrl = useSetting("site-url");

  useEffect(
    () => {
      if (isEmbedSettingsLoaded) {
        const script = document.createElement("script");

        script.src = `${instanceUrl}/app/embed.js`;
        document.body.appendChild(script);

        script.onload = () => {
          const { MetabaseEmbed } = window["metabase.embed"];

          embedJsRef.current = new MetabaseEmbed({
            ...settings,

            target: "#iframe-embed-container",
            iframeClassName: S.EmbedPreviewIframe,
            useExistingUserSession: true,
            instanceUrl,

            ...(localeOverride ? { locale: localeOverride } : {}),
          });

          embedJsRef.current.addEventListener("ready", () =>
            setIsIframeLoaded(true),
          );
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
    if (embedJsRef.current && isIframeLoaded) {
      embedJsRef.current.updateSettings({
        // Clear the existing experiences.
        // This is necessary as `updateSettings` merges new settings with existing ones.
        template: undefined,
        questionId: undefined,
        dashboardId: undefined,

        // We must always use user sessions in the preview.
        // We never use SSO in the preview as that adds complexity.
        ..._.omit(settings, ["useExistingUserSession"]),
      });
    }
  }, [settings, isIframeLoaded]);

  return (
    <Card
      id="iframe-embed-container"
      data-iframe-loaded={isIframeLoaded}
      bg={settings.theme?.colors?.background}
      h="100%"
    />
  );
};
