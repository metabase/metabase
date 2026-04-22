// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global } from "@emotion/react";
import { type JSX, memo, useEffect, useId, useRef } from "react";

import { ContentTranslationsProvider } from "embedding-sdk-bundle/components/private/ContentTranslationsProvider";
import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
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
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
import { LocaleProvider } from "metabase/embedding/LocaleProvider";
import type { SdkStore } from "metabase/embedding/sdk-bundle/store-types";
import type { ComponentProviderProps } from "metabase/embedding/sdk-bundle/types/metabase-provider";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";
import { isEmbeddingThemeV1 } from "metabase/embedding-sdk/theme";
import { METABOT_SDK_EE_PLUGIN } from "metabase/plugins";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/ui/components/theme/EmotionCacheProvider";
import { MetabaseReduxProvider, useSelector } from "metabase/utils/redux";
import { initializePlugins } from "sdk-ee-plugins";

import { SCOPED_CSS_RESET } from "../../private/PublicComponentStylesWrapper";
import { SdkFontsGlobalStyles } from "../../private/SdkGlobalFontsStyles";
import { PortalContainer } from "../../private/SdkPortalContainer";
import { SdkUsageProblemDisplay } from "../../private/SdkUsageProblem";

export type ComponentProviderInternalProps = ComponentProviderProps & {
  reduxStore: SdkStore;
  isLocalHost?: boolean;
};

let hasInitializedPlugins = false;

/**
 * Initializes EE plugins synchronously during render
 * to avoid an extra frame where children render without plugins.
 *
 * Uses reduxStore.dispatch directly instead of the useDispatch hook,
 * since the hook-based dispatch may not be available during render.
 * This follows the same pattern as use-init-data-internal.ts.
 */
function useInitPlugins(reduxStore: SdkStore) {
  const tokenFeatures = useSelector(
    (state) => state.settings.values["token-features"],
  );

  // Modular Embedding already initializes the plugins in its entrypoint.
  // We have to avoid re-initializing SDK plugins as they could override
  // some of plugins needed by EAJS
  if (isEmbeddingEajs() || !tokenFeatures) {
    return;
  }

  if (!hasInitializedPlugins) {
    hasInitializedPlugins = true;

    initializePlugins();
  }

  // Mark ready for this store instance on first render.
  if (!reduxStore.getState().sdk?.pluginsReady) {
    reduxStore.dispatch(setPluginsReady(true));
  }
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

  useSdkCustomLoader();

  useEffect(() => {
    reduxStore.dispatch(setIsGuestEmbed(!!isGuestEmbed));
  }, [reduxStore, isGuestEmbed]);

  useEffect(() => {
    if (fontFamily) {
      reduxStore.dispatch(setOptions({ font: fontFamily }));
    }
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

                {isInstanceToRender && <ContentTranslationsProvider />}
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

export type { ComponentProviderProps } from "metabase/embedding/sdk-bundle/types/metabase-provider";

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
