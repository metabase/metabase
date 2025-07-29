import { Global } from "@emotion/react";
import type { Action, Store } from "@reduxjs/toolkit";
import {
  type JSX,
  type PropsWithChildren,
  type ReactNode,
  memo,
  useEffect,
  useRef,
} from "react";

import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { SdkIncompatibilityWithInstanceBanner } from "embedding-sdk/components/private/SdkVersionCompatibilityHandler/SdkIncompatibilityWithInstanceBanner";
import { useInitData } from "embedding-sdk/hooks";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { getSdkStore } from "embedding-sdk/store";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setMetabaseClientUrl,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SdkStoreState } from "embedding-sdk/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type { CommonStylingProps } from "embedding-sdk/types/props";
import type { SdkErrorComponent } from "embedding-sdk/types/ui";
import { useInstanceLocale } from "metabase/common/hooks/use-instance-locale";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { Box } from "metabase/ui";
import { MetabotProvider } from "metabase-enterprise/metabot/context";

import { SCOPED_CSS_RESET } from "../private/PublicComponentStylesWrapper";
import { RenderSingleCopy } from "../private/RenderSingleCopy/RenderSingleCopy";
import { SdkFontsGlobalStyles } from "../private/SdkGlobalFontsStyles";
import { PortalContainer } from "../private/SdkPortalContainer";
import { SdkUsageProblemDisplay } from "../private/SdkUsageProblem";

/**
 * @expand
 * @category MetabaseProvider
 */
export interface MetabaseProviderProps
  extends Omit<CommonStylingProps, "style"> {
  /**
   * The children of the MetabaseProvider component.
   */
  children: ReactNode;

  /**
   * Defines how to authenticate with Metabase.
   */
  authConfig: MetabaseAuthConfig;

  /**
   * See [Appearance](https://www.metabase.com/docs/latest/embedding/sdk/appearance).
   */
  theme?: MetabaseTheme;

  /**
   * See [Plugins](https://www.metabase.com/docs/latest/embedding/sdk/plugins).
   */
  pluginsConfig?: MetabasePluginsConfig;

  /**
   * See [Global event handlers](https://www.metabase.com/docs/latest/embedding/sdk/config#global-event-handlers).
   */
  eventHandlers?: SdkEventHandlersConfig;

  /**
   * Defines the display language. Accepts an ISO language code such as `en` or `de`.
   * Defaults to the instance locale.
   **/
  locale?: string;

  /**
   * A custom loader component to display while the SDK is loading.
   **/
  loaderComponent?: () => JSX.Element;

  /**
   * A custom error component to display when the SDK encounters an error.
   **/
  errorComponent?: SdkErrorComponent;

  /**
   * Whether to allow logging to the DevTools console. Defaults to true.
   **/
  allowConsoleLog?: boolean;
}

export interface InternalMetabaseProviderProps extends MetabaseProviderProps {
  reduxStore: Store<SdkStoreState, Action>;
}

export const MetabaseProviderInternal = ({
  children,
  authConfig,
  pluginsConfig,
  eventHandlers,
  theme,
  reduxStore,
  className,
  locale,
  errorComponent,
  loaderComponent,
  allowConsoleLog,
}: InternalMetabaseProviderProps): JSX.Element => {
  const { fontFamily } = theme ?? {};
  useInitData({ authConfig, allowConsoleLog });

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
          <Box className={className}>{children}</Box>
        </LocaleProvider>

        <RenderSingleCopy>
          <Global styles={SCOPED_CSS_RESET} />
          <SdkFontsGlobalStyles baseUrl={authConfig.metabaseInstanceUrl} />
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
  ...externalProps
}: MetabaseProviderProps | PropsWithChildren) {
  const { props: metabaseProviderProps } = useMetabaseProviderPropsStore();

  const props = (
    metabaseProviderProps.initialized
      ? metabaseProviderProps
      : (externalProps ?? null)
  ) as MetabaseProviderProps | InternalMetabaseProviderProps | null;

  const reduxStoreRef = useRef<Store<SdkStoreState, Action> | null>(null);

  if (!reduxStoreRef.current) {
    reduxStoreRef.current =
      props && "reduxStore" in props && props.reduxStore
        ? props.reduxStore
        : getSdkStore();
  }

  if (!props) {
    return null;
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
