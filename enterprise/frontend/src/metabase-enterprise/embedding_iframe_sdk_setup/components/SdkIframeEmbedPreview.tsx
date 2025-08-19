//
import { createElement, useCallback, useEffect, useMemo } from "react";
import { useSearchParam } from "react-use";
import { match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import { Card } from "metabase/ui";
import type { SdkIframeEmbedBaseSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getDerivedDefaultColorsForEmbedFlow } from "../utils/derived-colors-for-embed-flow";
import { getConfigurableThemeColors } from "../utils/theme-colors";

import S from "./SdkIframeEmbedPreview.module.css";

// we import the equivalent of embed.js so that we don't add extra loading time
// by appending the script
import "metabase-enterprise/embedding_iframe_sdk/embed";

declare global {
  interface Window {
    metabaseConfig: Partial<SdkIframeEmbedBaseSettings>;
  }
}

export const SdkIframeEmbedPreview = () => {
  const { settings } = useSdkIframeEmbedSetupContext();

  const localeOverride = useSearchParam("locale");

  const instanceUrl = useSetting("site-url");
  const applicationColors = useSetting("application-colors");

  const defineMetabaseConfig = useCallback(
    (metabaseConfig: SdkIframeEmbedBaseSettings) => {
      window.metabaseConfig = metabaseConfig;
    },
    [],
  );

  const derivedTheme = useMemo(() => {
    // TODO(EMB-696): There is a bug in the SDK where if we set the theme back to undefined,
    // some color will not be reset to the default (e.g. text color, CSS variables).
    // We can remove this block once EMB-696 is fixed.
    const defaultTheme: MetabaseTheme = {
      colors: Object.fromEntries(
        getConfigurableThemeColors().map((color) => [
          color.key,
          applicationColors?.[color.originalColorKey] ??
            defaultMetabaseColors[color.originalColorKey],
        ]),
      ),
    };

    return getDerivedDefaultColorsForEmbedFlow(
      settings.theme ?? defaultTheme,
      applicationColors ?? undefined,
    );
  }, [applicationColors, settings.theme]);

  const metabaseConfig = useMemo(
    () => ({
      instanceUrl,
      useExistingUserSession: true,
      theme: derivedTheme,
      ...(localeOverride ? { locale: localeOverride } : {}),
    }),
    [instanceUrl, localeOverride, derivedTheme],
  );

  // initial configuration, needed so that the element finds the config on first render
  if (!window.metabaseConfig.instanceUrl) {
    defineMetabaseConfig(metabaseConfig);
  }

  useEffect(() => {
    defineMetabaseConfig(metabaseConfig);
  }, [metabaseConfig, defineMetabaseConfig]);

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
        .with({ componentName: "metabase-browser" }, () => null)
        .exhaustive()}
    </Card>
  );
};
