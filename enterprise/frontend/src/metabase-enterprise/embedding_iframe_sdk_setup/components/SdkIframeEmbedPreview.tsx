import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParam } from "react-use";
import _ from "underscore";

import type { MetabaseTheme } from "embedding-sdk";
import { useSetting } from "metabase/common/hooks";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import { Card } from "metabase/ui";
import type { MetabaseEmbedElement } from "metabase-enterprise/embedding_iframe_sdk/embed";
import type { SdkIframeEmbedBaseSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getEmbedCustomElementSnippet } from "../utils/embed-snippet";
import { getConfigurableThemeColors } from "../utils/theme-colors";

declare global {
  interface Window {
    metabaseConfig: Partial<SdkIframeEmbedBaseSettings>;
  }
}

export const SdkIframeEmbedPreview = () => {
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);

  const { settings, isEmbedSettingsLoaded, experience } =
    useSdkIframeEmbedSetupContext();

  const embedRef = useRef<MetabaseEmbedElement | null>(null);
  const localeOverride = useSearchParam("locale");
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const instanceUrl = useSetting("site-url");
  const applicationColors = useSetting("application-colors");

  // TODO: There is a bug in the SDK where if we set the theme back to undefined,
  // some color will not be reset to the default (e.g. text color, CSS variables).
  // We can remove this block once the bug is fixed.
  const defaultTheme: MetabaseTheme = useMemo(() => {
    const colors = Object.fromEntries(
      getConfigurableThemeColors().map((color) => [
        color.key,
        applicationColors?.[color.originalColorKey] ??
          defaultMetabaseColors[color.originalColorKey],
      ]),
    );

    return { colors };
  }, [applicationColors]);

  useEffect(
    () => {
      if (isEmbedSettingsLoaded) {
        const script = document.createElement("script");

        script.src = `${instanceUrl}/app/embed.js`;
        document.body.appendChild(script);

        const defineMetabaseConfig = (args: SdkIframeEmbedBaseSettings) => {
          window.metabaseConfig = args;
        };

        script.onload = () => {
          defineMetabaseConfig({
            instanceUrl,
            useExistingUserSession: true,
            theme: settings.theme,
            ...(localeOverride ? { locale: localeOverride } : {}),
          });

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

          const customElement = document.getElementById(
            "custom-element-id",
          ) as MetabaseEmbedElement;
          embedRef.current = customElement;

          customElement.style.height = "100%";

          embedRef.current.addEventListener("ready", () =>
            setIsIframeLoaded(true),
          );
        };

        scriptRef.current = script;
      }

      return () => {
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

        // Fallback to the default theme if not set due to the bug mentioned above.
        theme: settings.theme ?? defaultTheme,
      });
    }
  }, [settings, isIframeLoaded, defaultTheme]);

  return (
    <Card
      id="iframe-embed-container"
      data-iframe-loaded={isIframeLoaded}
      bg={settings.theme?.colors?.background}
      h="100%"
    />
  );
};
