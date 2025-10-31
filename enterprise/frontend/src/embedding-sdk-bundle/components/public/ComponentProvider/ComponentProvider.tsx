import { Global } from "@emotion/react";
import { type JSX, memo, useEffect, useId, useRef } from "react";

import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import { SdkIncompatibilityWithInstanceBanner } from "embedding-sdk-bundle/components/private/SdkVersionCompatibilityHandler/SdkIncompatibilityWithInstanceBanner";
import { useInitDataInternal } from "embedding-sdk-bundle/hooks/private/use-init-data";
import { getSdkStore } from "embedding-sdk-bundle/store";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setPlugins,
  setTheme,
  setThemeError,
  setThemeLoading,
} from "embedding-sdk-bundle/store/reducer";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
import { useNamedTheme } from "metabase/embedding-sdk/hooks";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

import { SCOPED_CSS_RESET } from "../../private/PublicComponentStylesWrapper";
import { SdkFontsGlobalStyles } from "../../private/SdkGlobalFontsStyles";
import { PortalContainer } from "../../private/SdkPortalContainer";
import { SdkUsageProblemDisplay } from "../../private/SdkUsageProblem";

type ComponentProviderInternalProps = ComponentProviderProps & {
  reduxStore: SdkStore;
  isLocalHost?: boolean;
};

export const ComponentProviderInternal = ({
  children,
  authConfig,
  pluginsConfig,
  eventHandlers,
  theme: themeInput,
  reduxStore,
  locale,
  errorComponent,
  loaderComponent,
  allowConsoleLog,
  isLocalHost,
}: ComponentProviderInternalProps): JSX.Element => {
  // Determine if we need to load a named theme
  const themeName = typeof themeInput === "string" ? themeInput : null;
  const directTheme = typeof themeInput === "object" ? themeInput : undefined;

  // Load named theme if a string is provided
  const {
    theme: namedTheme,
    isLoading: isThemeLoading,
    error: themeError,
  } = useNamedTheme(themeName);

  // Use the loaded theme's settings or the direct theme object
  const theme = themeName && namedTheme ? namedTheme.settings : directTheme;

  const { fontFamily } = theme ?? {};

  // The main call of useInitData happens in the MetabaseProvider
  // This call in the ComponentProvider is still needed for:
  // - Storybook stories, where we don't have the MetabaseProvider
  // - Unit tests
  useInitDataInternal({ reduxStore, authConfig, isLocalHost });

  // Dispatch theme loading state to Redux
  useEffect(() => {
    if (themeName) {
      reduxStore.dispatch(setThemeLoading(isThemeLoading));
    }
  }, [reduxStore, themeName, isThemeLoading]);

  useEffect(() => {
    if (themeName) {
      if (themeError) {
        reduxStore.dispatch(setThemeError(themeError));
      } else if (theme) {
        reduxStore.dispatch(setTheme(theme));
      }
    } else if (directTheme) {
      reduxStore.dispatch(setTheme(directTheme));
    }
  }, [reduxStore, themeName, theme, themeError, directTheme]);

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
    reduxStore.dispatch(setLoaderComponent(loaderComponent ?? null));
  }, [reduxStore, loaderComponent]);

  useEffect(() => {
    reduxStore.dispatch(setErrorComponent(errorComponent ?? null));
  }, [reduxStore, errorComponent]);

  const instanceLocale = useInstanceLocale();

  const ensureSingleInstanceId = useId();

  // Show loading indicator if theme is being loaded
  const isLoadingTheme = themeName && isThemeLoading;

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
                {isLoadingTheme && loaderComponent ? (
                  loaderComponent()
                ) : (
                  <>
                    {children}

                    <SdkIncompatibilityWithInstanceBanner />
                  </>
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
      <MetabotProvider>
        <ComponentProviderInternal
          {...props}
          reduxStore={reduxStoreRef.current!}
        >
          {children}
        </ComponentProviderInternal>
      </MetabotProvider>
    </MetabaseReduxProvider>
  );
});
