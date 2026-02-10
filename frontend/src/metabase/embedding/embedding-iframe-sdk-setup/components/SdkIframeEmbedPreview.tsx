import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";

import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import { useSetting } from "metabase/common/hooks";
import { METABASE_CONFIG_IS_PROXY_FIELD_NAME } from "metabase/embedding/embedding-iframe-sdk/constants";
// we import the equivalent of embed.js so that we don't add extra loading time
// by appending the script
import { setupConfigWatcher } from "metabase/embedding/embedding-iframe-sdk/embed";
import type { SdkIframeEmbedBaseSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { buildEmbedAttributes } from "metabase/embedding/embedding-iframe-sdk-setup/utils/build-embed-attributes";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import { Card } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getDerivedDefaultColorsForEmbedFlow } from "../utils/derived-colors-for-embed-flow";
import { getConfigurableThemeColors } from "../utils/theme-colors";

import { EmbedPreviewLoadingOverlay } from "./EmbedPreviewLoadingOverlay";
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
    isSimpleEmbedFeatureAvailable,
    experience,
    settings,
    guestEmbedSignedTokenForPreview,
  } = useSdkIframeEmbedSetupContext();
  const [isLoading, setIsLoading] = useState(true);

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

  const theme = useMemo(() => {
    if (settings.theme?.preset) {
      return applyThemePreset(settings.theme);
    }

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

    const derivedTheme = getDerivedDefaultColorsForEmbedFlow({
      isSimpleEmbedFeatureAvailable,
      theme: settings.theme ?? defaultTheme,
      applicationColors: applicationColors ?? undefined,
    });

    return derivedTheme;
  }, [isSimpleEmbedFeatureAvailable, applicationColors, settings.theme]);

  const metabaseConfig = useMemo(
    () => ({
      instanceUrl,
      theme,
      useExistingUserSession: true,
      isGuest: settings.isGuest,
    }),
    [instanceUrl, theme, settings.isGuest],
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

  const attributes = buildEmbedAttributes({
    experience,
    settings,
    token: guestEmbedSignedTokenForPreview,
    wrapWithQuotes: false,
  });

  return (
    <Card
      className={S.EmbedPreviewIframe}
      id="iframe-embed-container"
      style={{ backgroundColor: theme?.colors?.background }}
      h="100%"
      ref={containerRef}
      pos="relative"
    >
      {match(settings)
        .with(
          { componentName: "metabase-question", template: "exploration" },
          () => createElement("metabase-question", attributes),
        )
        .with({ componentName: "metabase-question" }, () =>
          createElement("metabase-question", attributes),
        )
        .with({ componentName: "metabase-dashboard" }, () =>
          createElement("metabase-dashboard", attributes),
        )
        .with({ componentName: "metabase-browser" }, () =>
          createElement("metabase-browser", attributes),
        )
        .with({ componentName: "metabase-metabot" }, () =>
          createElement("metabase-metabot", attributes),
        )
        .exhaustive()}

      <EmbedPreviewLoadingOverlay
        isVisible={isLoading}
        bg={theme?.colors?.background}
      />
    </Card>
  );
};

export const SdkIframeEmbedPreview = () => {
  const { settings } = useSdkIframeEmbedSetupContext();

  const remountKey = useMemo(
    () =>
      JSON.stringify({
        // We must re-mount preview when `isGuest` setting is changed
        // to force its change for embed.js
        isGuest: settings.isGuest,
      }),
    [settings.isGuest],
  );

  return <SdkIframeEmbedPreviewInner key={remountKey} />;
};
