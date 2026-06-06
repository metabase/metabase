// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global } from "@emotion/react";
import { type JSX, memo, useEffect, useId, useRef } from "react";

import {
  getSdkAuthMethod,
  initSdkTracker,
  trackSdkEvent,
} from "embedding-sdk-bundle/analytics/snowplow";
import { ContentTranslationsProvider } from "embedding-sdk-bundle/components/private/ContentTranslationsProvider";
import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import { useArePluginsReady } from "embedding-sdk-bundle/hooks/private/use-are-plugins-ready";
import { useInitDataInternal } from "embedding-sdk-bundle/hooks/private/use-init-data";
import { useNormalizeComponentProviderProps } from "embedding-sdk-bundle/hooks/private/use-normalize-component-provider-props";
import { useSdkCustomLoader } from "embedding-sdk-bundle/hooks/private/use-sdk-custom-loader";
import { getSdkStore, useSdkSelector } from "embedding-sdk-bundle/store";
import {
  setErrorComponent,
  setEventHandlers,
  setIsGuestEmbed,
  setPlugins,
  setPluginsReady,
  setSdkTrackerReady,
} from "embedding-sdk-bundle/store/reducer";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
import { LocaleProvider } from "metabase/embedding/LocaleProvider";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";
import { isEmbeddingThemeV1 } from "metabase/embedding-sdk/theme";
import { MetabaseReduxProvider, useSelector } from "metabase/redux";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/ui/components/theme/EmotionCacheProvider";
import { initializePlugins } from "sdk-ee-plugins";

import { SCOPED_CSS_RESET } from "../../private/PublicComponentStylesWrapper";
import { SdkFontsGlobalStyles } from "../../private/SdkGlobalFontsStyles";
import { PortalContainer } from "../../private/SdkPortalContainer";
import { SdkUsageProblemDisplay } from "../../private/SdkUsageProblem";
import { METABOT_SDK_EE_PLUGIN } from "../MetabotQuestion/MetabotQuestion";

export type ComponentProviderInternalProps = ComponentProviderProps & {
  reduxStore: SdkStore;
  isLocalHost?: boolean;
};

const EMBEDDING_SDK_SCHEMA = "iglu:com.metabase/embedding_sdk/jsonschema/1-0-0";

function deriveAuthMethod(authConfig: MetabaseAuthConfig): string {
  if (authConfig.isGuest) {
    return "session";
  }
  if ("apiKey" in authConfig && authConfig.apiKey) {
    return "api_key";
  }
  return "sso";
}

let hasInitializedPlugins = false;

// Initialize the SDK Snowplow tracker and fire the provider-init adoption beacon.
// Waits for anon-tracking-enabled to be loaded from the instance settings so the
// opt-out gate is respected. Fires once per JS load; idempotent under re-renders.
function useSdkTrackerInit(
  authConfig: MetabaseAuthConfig,
  reduxStore: SdkStore,
) {
  const isTrackingEnabled = useSdkSelector((state) =>
    Boolean(state.settings?.values?.["anon-tracking-enabled"]),
  );

  useEffect(() => {
    if (!isTrackingEnabled) {
      return;
    }

    const authMethod = deriveAuthMethod(authConfig);
    const wasJustInitialized = initSdkTracker(
      authConfig.metabaseInstanceUrl,
      authMethod,
      reduxStore,
    );

    // setSdkTrackerReady unblocks per-mount hooks in child components. Set it
    // even when wasJustInitialized=false (e.g. multiple providers) so children
    // in a nested provider context can also fire.
    reduxStore.dispatch(setSdkTrackerReady(true));

    if (wasJustInitialized) {
      const sdkVersion =
        getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
        null;

      trackSdkEvent({
        schema: EMBEDDING_SDK_SCHEMA,
        data: {
          component: null,
          properties: null,
          global: {
            auth_method: getSdkAuthMethod(),
            sdk_version: sdkVersion,
          },
        },
      });
    }
    // isTrackingEnabled is the only dep: fire once when the opt-out gate becomes
    // known. authConfig and reduxStore are stable across the provider lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingEnabled]);
}

/**
 * Initializes EE plugins synchronously during render
 * to avoid an extra frame where children render without plugins.
 */
function useInitPlugins(reduxStore: SdkStore) {
  const tokenFeatures = useSelector(
    (state) => state.settings.values["token-features"],
  );

  // Modular Embedding already initializes the plugins in its entrypoint.
  // We have to avoid re-initializing SDK plugins as they could override
  // some of plugins needed by EAJS
  const shouldInitialize = !isEmbeddingEajs() && !!tokenFeatures;

  if (shouldInitialize && !hasInitializedPlugins) {
    hasInitializedPlugins = true;

    initializePlugins();
  }

  // Dispatch is deferred to an effect to avoid scheduling updates on other
  // subscribed components mid-render (React "setState while rendering" warning).
  useEffect(() => {
    if (!shouldInitialize) {
      return;
    }

    if (!reduxStore.getState().sdk?.pluginsReady) {
      reduxStore.dispatch(setPluginsReady(true));
    }
  }, [shouldInitialize, reduxStore]);
}

export const ComponentProviderInternal = (
  props: ComponentProviderInternalProps,
): JSX.Element => {
  const {
    children,
    authConfig,
    pluginsConfig,
    eventHandlers,
    theme,
    reduxStore,
    locale,
    errorComponent,
    allowConsoleLog,
    isLocalHost,
  } = useNormalizeComponentProviderProps(props);

  const isGuestEmbed = !!authConfig.isGuest;
  const fontFamily = isEmbeddingThemeV1(theme) ? theme.fontFamily : undefined;

  // The main call of useInitData happens in the MetabaseProvider
  // This call in the ComponentProvider is still needed for:
  // - Storybook stories, where we don't have the MetabaseProvider
  // - Unit tests
  useInitDataInternal({
    reduxStore,
    isGuestEmbed,
    authConfig,
    isLocalHost,
  });

  useInitPlugins(reduxStore);
  useSdkTrackerInit(authConfig, reduxStore);

  useSdkCustomLoader();

  useEffect(() => {
    reduxStore.dispatch(setIsGuestEmbed(!!isGuestEmbed));
  }, [reduxStore, isGuestEmbed]);

  useEffect(() => {
    reduxStore.dispatch(setOptions({ font: fontFamily }));
  }, [reduxStore, fontFamily]);

  useEffect(() => {
    reduxStore.dispatch(setPlugins(pluginsConfig || null));
  }, [reduxStore, pluginsConfig]);

  useEffect(() => {
    reduxStore.dispatch(setEventHandlers(eventHandlers || null));
  }, [reduxStore, eventHandlers]);

  useEffect(() => {
    reduxStore.dispatch(setErrorComponent(errorComponent ?? null));
  }, [reduxStore, errorComponent]);

  const instanceLocale = useInstanceLocale();

  const ensureSingleInstanceId = useId();

  // Defer ContentTranslationsProvider until EE plugins are assigned to
  // PLUGIN_CONTENT_TRANSLATION; otherwise useSetupAuthContentTranslations
  // calls the OSS no-op, and its deps don't re-fire when the EE fn lands.
  const pluginsReady = useArePluginsReady();

  return (
    <EmotionCacheProvider>
      <SdkThemeProvider theme={theme}>
        <EnsureSingleInstance
          groupId="component-providers"
          instanceId={ensureSingleInstanceId}
        >
          {({ isInstanceToRender }) => (
            <>
              <LocaleProvider locale={locale || instanceLocale}>
                {children}

                {isInstanceToRender && pluginsReady && (
                  <ContentTranslationsProvider />
                )}
              </LocaleProvider>

              {isInstanceToRender && (
                <>
                  <Global styles={SCOPED_CSS_RESET} />

                  <SdkFontsGlobalStyles
                    baseUrl={authConfig.metabaseInstanceUrl}
                  />

                  <SdkUsageProblemDisplay
                    authConfig={authConfig}
                    allowConsoleLog={allowConsoleLog}
                    isLocalHost={isLocalHost}
                  />

                  <PortalContainer />
                </>
              )}
            </>
          )}
        </EnsureSingleInstance>
      </SdkThemeProvider>
    </EmotionCacheProvider>
  );
};

export type ComponentProviderProps = MetabaseProviderProps & {
  reduxStore?: SdkStore;
  isLocalHost?: boolean;
};

export const ComponentProvider = memo(function ComponentProvider({
  children,
  ...props
}: ComponentProviderProps) {
  const reduxStoreRef = useRef<SdkStore | null>(null);

  if (!reduxStoreRef.current) {
    reduxStoreRef.current = props.reduxStore ?? getSdkStore();
  }

  return (
    <MetabaseReduxProvider store={reduxStoreRef.current!}>
      <METABOT_SDK_EE_PLUGIN.MetabotProvider>
        <ComponentProviderInternal
          {...props}
          reduxStore={reduxStoreRef.current!}
        >
          {children}
        </ComponentProviderInternal>
      </METABOT_SDK_EE_PLUGIN.MetabotProvider>
    </MetabaseReduxProvider>
  );
});
