//
import { createElement, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParam } from "react-use";
import { match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import { Card } from "metabase/ui";
import type { SdkIframeEmbedBaseSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getConfigurableThemeColors } from "../utils/theme-colors";

import S from "./SdkIframeEmbedPreview.module.css";

declare global {
  interface Window {
    metabaseConfig: Partial<SdkIframeEmbedBaseSettings>;
  }
}

export const SdkIframeEmbedPreview = () => {
  const { settings, isEmbedSettingsLoaded, experience } =
    useSdkIframeEmbedSetupContext();

  const localeOverride = useSearchParam("locale");
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const instanceUrl = useSetting("site-url");
  const applicationColors = useSetting("application-colors");

  const defineMetabaseConfig = useCallback(
    (metabaseConfig: SdkIframeEmbedBaseSettings) => {
      window.metabaseConfig = metabaseConfig;
    },
    [],
  );

  useEffect(
    () => {
      if (isEmbedSettingsLoaded) {
        const script = document.createElement("script");
        script.src = `${instanceUrl}/app/embed.js`;
        document.body.appendChild(script);
        scriptRef.current = script;
      }

      return () => {
        scriptRef.current?.remove();
      };
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings are synced via useEffect below
    [isEmbedSettingsLoaded, experience],
  );

  // TODO(EMB-696): There is a bug in the SDK where if we set the theme back to undefined,
  // some color will not be reset to the default (e.g. text color, CSS variables).
  // We can remove this block once EMB-696 is fixed.
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

  useEffect(() => {
    defineMetabaseConfig({
      instanceUrl,
      useExistingUserSession: true,
      theme: settings.theme ?? defaultTheme,
      ...(localeOverride ? { locale: localeOverride } : {}),
    });
  }, [
    instanceUrl,
    localeOverride,
    settings.theme,
    defineMetabaseConfig,
    defaultTheme,
  ]);

  return (
    <Card
      className={S.EmbedPreviewIframe}
      id="iframe-embed-container"
      bg={settings.theme?.colors?.background}
      h="100%"
    >
      {match(settings)
        .with(
          { componentName: "metabase-question", template: "exploration" },
          (s) =>
            createElement("metabase-question", {
              "question-id": "new",
              "is-save-enabled": s.isSaveEnabled,
              "target-collection": s.targetCollection,
              "entity-types": s.entityTypes
                ? JSON.stringify(s.entityTypes)
                : undefined,
            }),
        )
        .with({ componentName: "metabase-question" }, (s) =>
          createElement("metabase-question", {
            "question-id": s.questionId,
            drills: s.drills,
            "with-title": s.withTitle,
            "with-downloads": s.withDownloads,
            "initial-sql-parameters": s.initialSqlParameters
              ? JSON.stringify(s.initialSqlParameters)
              : undefined,
            "is-save-enabled": s.isSaveEnabled,
            "target-collection": s.targetCollection,
            "entity-types": s.entityTypes
              ? JSON.stringify(s.entityTypes)
              : undefined,
          }),
        )
        .with({ componentName: "metabase-dashboard" }, (s) =>
          createElement("metabase-dashboard", {
            "dashboard-id": s.dashboardId,
            drills: s.drills,
            "with-title": s.withTitle,
            "with-downloads": s.withDownloads,
            "initial-parameters": s.initialParameters
              ? JSON.stringify(s.initialParameters)
              : undefined,
            "hidden-parameters": s.hiddenParameters
              ? JSON.stringify(s.hiddenParameters)
              : undefined,
          }),
        )
        .exhaustive()}
    </Card>
  );
};
