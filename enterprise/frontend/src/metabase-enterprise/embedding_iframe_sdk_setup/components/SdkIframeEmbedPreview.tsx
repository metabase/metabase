//
import { createElement, useCallback, useEffect, useRef } from "react";
import { useSearchParam } from "react-use";
import { match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import { Card } from "metabase/ui";
import type { SdkIframeEmbedBaseSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { useSdkIframeEmbedSetupContext } from "../context";

import styles from "./SdkIframeEmbedPreview.module.css";

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

  useEffect(() => {
    defineMetabaseConfig({
      instanceUrl,
      useExistingUserSession: true,
      theme: settings.theme ?? undefined,
      ...(localeOverride ? { locale: localeOverride } : {}),
    });
  }, [instanceUrl, localeOverride, settings.theme, defineMetabaseConfig]);

  return (
    <Card
      className={styles.EmbedPreviewIframe}
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
