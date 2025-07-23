import { useEffect, useRef, useState } from "react";
import { useSearchParam } from "react-use";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";
import type { MetabaseEmbed } from "metabase-enterprise/embedding_iframe_sdk/embed";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getEmbedCustomElementSnippet } from "../utils/embed-snippet";

declare global {
  interface Window {
    "metabase.embed": { MetabaseEmbed: typeof MetabaseEmbed };
  }
}

export const SdkIframeEmbedPreview = () => {
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);

  const { settings, isEmbedSettingsLoaded, experience } =
    useSdkIframeEmbedSetupContext();

  const embedRef = useRef<MetabaseEmbedElement>(null);
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
          const { defineMetabaseConfig } = window["metabase.embed"];
          defineMetabaseConfig({
            instanceUrl: "http://localhost:3000",
            useExistingUserSession: true,
            ...(localeOverride ? { locale: localeOverride } : {}),
          });
          setIsConfigureLoaded(true);

          const wrapperDiv = document.getElementById("iframe-embed-container");
          if (!wrapperDiv) {
            console.error("#iframe-embed-container not found");
            return;
          }

          wrapperDiv.innerHTML = getEmbedCustomElementSnippet({
            settings,
            experience,
            id: "custom-element-id",
          });

          const customElement = document.getElementById("custom-element-id");
          embedRef.current = customElement as unknown;

          embedRef.current.addEventListener("ready", () =>
            setIsIframeLoaded(true),
          );
        };

        scriptRef.current = script;
      }

      return () => {
        embedRef.current?.destroy?.();
        scriptRef.current?.remove();
      };
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings are synced via useEffect below
    [isEmbedSettingsLoaded, experience],
  );

  useEffect(() => {
    if (embedRef.current) {
      embedRef.current.updateSettings({
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
    <div style={{ width: "100%", height: "100%" }} id="iframe-embed-container">
      {/* this is populated from the useEffect so that we can share `getEmbedCustomElementSnippet` with the code snippet on the left */}
    </div>
  );
};
