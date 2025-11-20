import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";

import { useSetting } from "metabase/common/hooks";
import { METABASE_CONFIG_IS_PROXY_FIELD_NAME } from "metabase/embedding/embedding-iframe-sdk/constants";
// we import the equivalent of embed.js so that we don't add extra loading time
// by appending the script
import { setupConfigWatcher } from "metabase/embedding/embedding-iframe-sdk/embed";
import type { SdkIframeEmbedBaseSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import type {
  SdkIframeDashboardEmbedSettings,
  SdkIframeQuestionEmbedSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import { Card } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getDerivedDefaultColorsForEmbedFlow } from "../utils/derived-colors-for-embed-flow";
import { getConfigurableThemeColors } from "../utils/theme-colors";

import { EmbedPreviewLoadingOverlay } from "./EmbedPreviewLoadingOverlay";
import { getVisibleParameters } from "./ParameterSettings/utils/get-visible-parameters";
import S from "./SdkIframeEmbedPreview.module.css";

declare global {
  interface Window {
    metabaseConfig?: Partial<SdkIframeEmbedBaseSettings> & {
      [METABASE_CONFIG_IS_PROXY_FIELD_NAME]?: boolean;
    };
  }
}

const SdkIframeEmbedPreviewInner = () => {
  const {
    settings,
    staticEmbeddingSignedTokenForPreview: staticEmbeddingSignedToken,
  } = useSdkIframeEmbedSetupContext();
  const [isLoading, setIsLoading] = useState(true);

  const isStaticEmbedding = !!settings.isStatic;

  const instanceUrl = useSetting("site-url");
  const applicationColors = useSetting("application-colors");

  const containerRef = useRef<HTMLDivElement>(null);

  const defineMetabaseConfig = useCallback(
    (metabaseConfig: SdkIframeEmbedBaseSettings) => {
      window.metabaseConfig = metabaseConfig;

      if (!window.metabaseConfig[METABASE_CONFIG_IS_PROXY_FIELD_NAME]) {
        setupConfigWatcher();
      }
    },
    [],
  );
  const cleanupMetabaseConfig = useCallback(() => {
    if (window.metabaseConfig) {
      delete window.metabaseConfig;
    }
  }, []);

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
      theme: derivedTheme,
      useExistingUserSession: true,
      isStatic: settings.isStatic,
    }),
    [instanceUrl, derivedTheme, settings.isStatic],
  );

  // initial configuration, needed so that the element finds the config on first render
  if (!window.metabaseConfig?.instanceUrl) {
    defineMetabaseConfig(metabaseConfig);
  }

  useEffect(() => {
    defineMetabaseConfig(metabaseConfig);
  }, [metabaseConfig, defineMetabaseConfig]);

  useEffect(
    () => () => {
      cleanupMetabaseConfig();
    },
    [cleanupMetabaseConfig],
  );

  // Show a "fake" loading indicator when componentName changes.
  // Embed JS has its own loading indicator, but it shows up after the iframe loads.
  useEffect(() => {
    if (containerRef.current) {
      const embed = containerRef.current.querySelector(settings.componentName);
      const handleReady = () => setIsLoading(false);

      if (embed) {
        setIsLoading(true);
        embed.addEventListener("ready", handleReady);

        return () => {
          embed.removeEventListener("ready", handleReady);
        };
      }
    }
  }, [settings.componentName]);

  return (
    <Card
      className={S.EmbedPreviewIframe}
      id="iframe-embed-container"
      bg={settings.theme?.colors?.background}
      h="100%"
      ref={containerRef}
      pos="relative"
    >
      {match(settings)
        .with(
          { componentName: "metabase-question", template: "exploration" },
          (s) =>
            createElement("metabase-question", {
              "question-id": "new",
              "target-collection": s.targetCollection,
              "entity-types": s.entityTypes
                ? JSON.stringify(s.entityTypes)
                : undefined,
              ...(!isStaticEmbedding && {
                "is-save-enabled": s.isSaveEnabled,
              }),
            }),
        )
        .with({ componentName: "metabase-question" }, (s) =>
          createElement("metabase-question", {
            ...(isStaticEmbedding
              ? { token: staticEmbeddingSignedToken }
              : {
                  "question-id": s.questionId,
                  "is-save-enabled": s.isSaveEnabled,
                }),
            "with-title": s.withTitle,
            drills: s.drills,
            "with-downloads": s.withDownloads,
            "target-collection": s.targetCollection,
            "entity-types": s.entityTypes
              ? JSON.stringify(s.entityTypes)
              : undefined,
            "initial-sql-parameters": s.initialSqlParameters
              ? JSON.stringify(
                  getVisibleParameters(
                    s.initialSqlParameters,
                    s.lockedParameters,
                  ),
                )
              : undefined,
            "hidden-parameters": s.hiddenParameters
              ? JSON.stringify(s.hiddenParameters)
              : undefined,
          }),
        )
        .with({ componentName: "metabase-dashboard" }, (s) =>
          createElement("metabase-dashboard", {
            ...(isStaticEmbedding
              ? { token: staticEmbeddingSignedToken }
              : {
                  "dashboard-id": s.dashboardId,
                }),
            "with-title": s.withTitle,
            drills: s.drills,
            "with-downloads": s.withDownloads,
            "initial-parameters": s.initialParameters
              ? JSON.stringify(
                  getVisibleParameters(s.initialParameters, s.lockedParameters),
                )
              : undefined,
            "hidden-parameters": s.hiddenParameters
              ? JSON.stringify(s.hiddenParameters)
              : undefined,
          }),
        )
        .with({ componentName: "metabase-browser" }, (s) =>
          createElement("metabase-browser", {
            "read-only": s.readOnly,
            "initial-collection": s.initialCollection,
            "collection-visible-columns": s.collectionVisibleColumns
              ? JSON.stringify(s.collectionVisibleColumns)
              : undefined,
          }),
        )
        .with({ componentName: "metabase-metabot" }, (s) =>
          createElement("metabase-metabot", { layout: s.layout }),
        )
        .exhaustive()}

      <EmbedPreviewLoadingOverlay
        isVisible={isLoading}
        bg={settings.theme?.colors?.background}
      />
    </Card>
  );
};

export const SdkIframeEmbedPreview = () => {
  const { settings } = useSdkIframeEmbedSetupContext();

  const hiddenParams = (
    settings as SdkIframeDashboardEmbedSettings | SdkIframeQuestionEmbedSettings
  ).hiddenParameters;
  const lockedParams = (
    settings as SdkIframeDashboardEmbedSettings | SdkIframeQuestionEmbedSettings
  ).lockedParameters;

  const remountKey = useMemo(
    () =>
      JSON.stringify({
        // Hidden and locked params must force re-mount the preview to avoid issues
        hiddenParams,
        lockedParams,
        // We must re-mount preview when `isStatic` setting is changed
        // to properly work with no-user auth handling inside rendered SDK
        isStaticEmbedding: settings.isStatic,
      }),
    [hiddenParams, lockedParams, settings.isStatic],
  );

  return <SdkIframeEmbedPreviewInner key={remountKey} />;
};
