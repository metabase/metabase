// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global } from "@emotion/react";
import { type JSX, memo, useEffect, useId, useRef } from "react";

import { useInitSdkTracker } from "embedding-sdk-bundle/analytics/tracker";
import { ContentTranslationsProvider } from "embedding-sdk-bundle/components/private/ContentTranslationsProvider";
import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import { useArePluginsReady } from "embedding-sdk-bundle/hooks/private/use-are-plugins-ready";
import { useInitDataInternal } from "embedding-sdk-bundle/hooks/private/use-init-data";
import { useNormalizeComponentProviderProps } from "embedding-sdk-bundle/hooks/private/use-normalize-component-provider-props";
import { useSdkCustomLoader } from "embedding-sdk-bundle/hooks/private/use-sdk-custom-loader";
import { getSdkStore } from "embedding-sdk-bundle/store";
import {
  setErrorComponent,
  setEventHandlers,
  setIsGuestEmbed,
  setPlugins,
  setPluginsReady,
} from "embedding-sdk-bundle/store/reducer";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
import { LocaleProvider } from "metabase/embedding/LocaleProvider";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";
import { isEmbeddingThemeV1 } from "metabase/embedding-sdk/theme";
import { MetabaseReduxProvider, useSelector } from "metabase/redux";
import { setOptions } from "metabase/redux/embed";
import { OverlayStackProvider } from "metabase/ui/components/overlays/overlay-stack";
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

let hasInitializedPlugins = false;

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
  useInitSdkTracker(authConfig, reduxStore, locale != null);

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
      <OverlayStackProvider>
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
      </OverlayStackProvider>
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
