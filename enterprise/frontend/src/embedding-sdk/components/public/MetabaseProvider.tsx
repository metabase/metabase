import { Global, css } from "@emotion/react";
import type { Action, Store } from "@reduxjs/toolkit";
import { type JSX, type ReactNode, memo, useEffect, useMemo } from "react";
import { Provider, useSelector } from "react-redux";

import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import { useInitData } from "embedding-sdk/hooks";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import { store } from "embedding-sdk/store";
import {
  setErrorComponent,
  setEventHandlers,
  setLoaderComponent,
  setMetabaseClientUrl,
  setPlugins,
} from "embedding-sdk/store/reducer";
import type { SdkStoreState } from "embedding-sdk/store/types";
import type { SDKConfig } from "embedding-sdk/types";
import type { MetabaseTheme } from "embedding-sdk/types/theme";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { setOptions } from "metabase/redux/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { getFontFiles } from "metabase/styled-components/selectors";

import { withPublicComponentWrapper } from "../private/PublicComponentWrapper";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

export interface MetabaseProviderProps {
  children: ReactNode;
  config: SDKConfig;
  pluginsConfig?: SdkPluginsConfig;
  eventHandlers?: SdkEventHandlersConfig;
  theme?: MetabaseTheme;
  className?: string;
}

interface InternalMetabaseProviderProps extends MetabaseProviderProps {
  store: Store<SdkStoreState, Action>;
}

export const MetabaseProviderInternal = ({
  children,
  config,
  pluginsConfig,
  eventHandlers,
  theme,
  store,
  className,
}: InternalMetabaseProviderProps): JSX.Element => {
  const { fontFamily } = theme ?? {};
  useInitData({ config });

  useEffect(() => {
    if (fontFamily) {
      store.dispatch(setOptions({ font: fontFamily }));
    }
  }, [store, fontFamily]);

  useEffect(() => {
    store.dispatch(setPlugins(pluginsConfig || null));
  }, [store, pluginsConfig]);

  useEffect(() => {
    store.dispatch(setEventHandlers(eventHandlers || null));
  }, [store, eventHandlers]);

  useEffect(() => {
    store.dispatch(setLoaderComponent(config.loaderComponent ?? null));
  }, [store, config.loaderComponent]);

  useEffect(() => {
    store.dispatch(setErrorComponent(config.errorComponent ?? null));
  }, [store, config.errorComponent]);

  useEffect(() => {
    store.dispatch(setMetabaseClientUrl(config.metabaseInstanceUrl));
  }, [store, config.metabaseInstanceUrl]);

  return (
    <EmotionCacheProvider>
      <SdkThemeProvider theme={theme}>
        <GlobalFontsStyles baseUrl={config.metabaseInstanceUrl} />
        <div className={className}>
          <PortalContainer />
          {children}
        </div>
      </SdkThemeProvider>
    </EmotionCacheProvider>
  );
};

export const MetabaseProvider = memo(function MetabaseProvider(
  props: MetabaseProviderProps,
) {
  return (
    <Provider store={store}>
      <MetabaseProviderInternal store={store} {...props} />
    </Provider>
  );
});

// TODO: move to separate files

/**
 * This is the portal container used by popovers modals etc, it is wrapped with withPublicComponentWrapper
 * so that it has our styles applied.
 * Mantine components needs to have the defaultProps set to use `EMBEDDING_SDK_ROOT_ELEMENT_ID` as target for the portal
 */
const PortalContainer = withPublicComponentWrapper(() => (
  <div id={EMBEDDING_SDK_ROOT_ELEMENT_ID}></div>
));

const GlobalFontsStyles = ({ baseUrl }: { baseUrl: string }) => {
  const fontFiles = useSelector(getFontFiles);

  const fontStyles = useMemo(
    () =>
      css`
      ${defaultFontFiles({ baseUrl })}}

      ${fontFiles?.map(
        file => css`
          @font-face {
            font-family: "Custom";
            src: url(${encodeURI(file.src)}) format("${file.fontFormat}");
            font-weight: ${file.fontWeight};
            font-style: normal;
            font-display: swap;
          }
        `,
      )}
    `,
    [fontFiles, baseUrl],
  );

  return <Global styles={fontStyles} />;
};
