// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global } from "@emotion/react";
import { type JSX, memo, useEffect, useId, useRef } from "react";

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
} from "embedding-sdk-bundle/store/reducer";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
import { isEmbeddingThemeV1 } from "metabase/embedding-sdk/theme";
import { MetabaseReduxProvider, useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
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

function useInitPlugins() {
  const tokenFeatures = useSelector(
    (state) => state.settings.values["token-features"],
  );

  useEffect(() => {
    if (hasInitializedPlugins || !tokenFeatures) {
      return;
    }

    hasInitializedPlugins = true;

    initializePlugins();
  }, [tokenFeatures]);
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

  useInitPlugins();

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
