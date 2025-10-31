import { render } from "@testing-library/react";
import type * as React from "react";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { ComponentProviderInternal } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { sdkReducers } from "embedding-sdk-bundle/store";
import type { SdkStore, SdkStoreState } from "embedding-sdk-bundle/store/types";
import { createMockSdkState } from "embedding-sdk-bundle/test/mocks/state";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import type { MantineThemeOverride } from "metabase/ui";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

export interface RenderWithSDKProvidersOptions {
  storeInitialState?: Partial<State>;
  componentProviderProps?: Partial<MetabaseProviderProps> | null;
  theme?: MantineThemeOverride;
  // Needed for Components/Hooks that retrieve Component/Hooks from the window.METABASE_EMBEDDING_SDK_BUNDLE
  metabaseEmbeddingSdkBundleExports?: Partial<
    typeof window.METABASE_EMBEDDING_SDK_BUNDLE
  >;
}

export function renderWithSDKProviders(
  ui: React.ReactElement,
  {
    storeInitialState = {},
    componentProviderProps = null,
    theme,
    metabaseEmbeddingSdkBundleExports,
    ...options
  }: RenderWithSDKProvidersOptions = {},
) {
  let { routing, ...initialState }: Partial<State> =
    createMockState(storeInitialState);

  const sdkReducerNames = Object.keys(sdkReducers);
  initialState = _.pick(
    { sdk: createMockSdkState(), ...initialState },
    ...sdkReducerNames,
  ) as SdkStoreState;

  // Enable the embedding_sdk premium feature and settings by default in SDK tests, unless explicitly disabled.
  // Without this, SDK components will not render due to missing token features and settings.
  if (!storeInitialState.settings && initialState.settings) {
    initialState.settings.values["token-features"].embedding_sdk = true;
    initialState.settings.values["enable-embedding-sdk"] = true;
  }

  const storeMiddleware = _.compact([Api.middleware]);

  const store = getStore(
    sdkReducers,
    initialState,
    storeMiddleware,
  ) as unknown as SdkStore;

  // Prevent spamming the console during tests
  if (componentProviderProps) {
    componentProviderProps.allowConsoleLog = false;
  }

  if (metabaseEmbeddingSdkBundleExports) {
    window.METABASE_EMBEDDING_SDK_BUNDLE =
      metabaseEmbeddingSdkBundleExports as typeof window.METABASE_EMBEDDING_SDK_BUNDLE;

    ensureMetabaseProviderPropsStore().updateInternalProps({
      reduxStore: store,
    });
  }

  const wrapper = (props: any) => {
    return (
      <MetabaseReduxProvider store={store}>
        {/* If we try to inject CSS variables to `.mb-wrapper`, it will slow the Jest tests down like crazy. */}
        <ThemeProviderContext.Provider value={{ withCssVariables: false }}>
          <ComponentProviderInternal
            {...props}
            {...componentProviderProps}
            reduxStore={store}
          />
        </ThemeProviderContext.Provider>
      </MetabaseReduxProvider>
    );
  };

  const utils = render(ui, {
    wrapper,
    ...options,
  });

  return {
    ...utils,
    store,
    history,
  };
}
