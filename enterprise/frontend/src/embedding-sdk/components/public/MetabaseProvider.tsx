import { Global } from "@emotion/react";
import { type JSX, memo, useEffect, useRef } from "react";

import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { SdkIncompatibilityWithInstanceBanner } from "embedding-sdk/components/private/SdkVersionCompatibilityHandler/SdkIncompatibilityWithInstanceBanner";
import { useInitData } from "embedding-sdk/hooks";
import { getSdkStore } from "embedding-sdk/store";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setMetabaseClientUrl,
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

import { SCOPED_CSS_RESET } from "../private/PublicComponentStylesWrapper";
import { RenderSingleCopy } from "../private/RenderSingleCopy/RenderSingleCopy";
import { SdkFontsGlobalStyles } from "../private/SdkGlobalFontsStyles";
import { PortalContainer } from "../private/SdkPortalContainer";
import { SdkUsageProblemDisplay } from "../private/SdkUsageProblem";

export interface InternalMetabaseProviderProps extends MetabaseProviderProps {
  reduxStore: SdkStore;
}

export const MetabaseProviderInternal = ({
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
}: InternalMetabaseProviderProps): JSX.Element => {
  const { fontFamily } = theme ?? {};
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

  useEffect(() => {
    reduxStore.dispatch(setMetabaseClientUrl(authConfig.metabaseInstanceUrl));
  }, [reduxStore, authConfig.metabaseInstanceUrl]);

  const instanceLocale = useInstanceLocale();

  return (
    <EmotionCacheProvider>
      <SdkThemeProvider theme={theme}>
        <LocaleProvider locale={locale || instanceLocale}>
          {children}
        </LocaleProvider>

        <RenderSingleCopy>
          <Global styles={SCOPED_CSS_RESET} />
          <SdkFontsGlobalStyles baseUrl={authConfig.metabaseInstanceUrl} />

          <SdkIncompatibilityWithInstanceBanner />
          <SdkUsageProblemDisplay
            authConfig={authConfig}
            allowConsoleLog={allowConsoleLog}
          />
          <PortalContainer />
        </RenderSingleCopy>
      </SdkThemeProvider>
    </EmotionCacheProvider>
  );
};

export const MetabaseProvider = memo(function MetabaseProvider({
  children,
  ...props
}: Omit<InternalMetabaseProviderProps, "reduxStore"> &
  Partial<Pick<InternalMetabaseProviderProps, "reduxStore">>) {
  const reduxStoreRef = useRef<SdkStore | null>(null);

  if (!reduxStoreRef.current) {
    reduxStoreRef.current = props.reduxStore ?? getSdkStore();
  }

  return (
    <MetabaseReduxProvider store={reduxStoreRef.current!}>
      <MetabotProvider>
        <MetabaseProviderInternal
          {...props}
          reduxStore={reduxStoreRef.current!}
        >
          {children}
        </MetabaseProviderInternal>
      </MetabotProvider>
    </MetabaseReduxProvider>
  );
});
