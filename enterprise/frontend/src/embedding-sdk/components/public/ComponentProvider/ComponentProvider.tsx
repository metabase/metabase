import { Global } from "@emotion/react";
import { type JSX, memo, useEffect, useId, useRef } from "react";

import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { SdkIncompatibilityWithInstanceBanner } from "embedding-sdk/components/private/SdkVersionCompatibilityHandler/SdkIncompatibilityWithInstanceBanner";
import { useInitData } from "embedding-sdk/hooks";
import { EnsureSingleInstance } from "embedding-sdk/sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { getSdkStore } from "embedding-sdk/store";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SdkStore } from "embedding-sdk/store/types";
import type { MetabaseProviderProps } from "embedding-sdk/types/metabase-provider";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
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
};

export const ComponentProviderInternal = ({
  children,
  authConfig,
  pluginsConfig,
  eventHandlers,
  theme,
  reduxStore,
  locale,
  errorComponent,
  loaderComponent,
  allowConsoleLog,
}: ComponentProviderInternalProps): JSX.Element => {
  const { fontFamily } = theme ?? {};

  // The main call of useInitData happens in the MetabaseProvider
  // This call in the ComponentProvider is still needed for:
  // - Storybook stories, where we don't have the MetabaseProvider
  // - Unit tests
  useInitData({ reduxStore, authConfig, allowConsoleLog });

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

                <SdkIncompatibilityWithInstanceBanner />
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
