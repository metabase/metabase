import type { ComponentProviderProps } from "embedding-sdk-bundle/components/public/ComponentProvider";

import { type SdkLoadingError, SdkLoadingState } from "../types/sdk-loading";

import { getWindow } from "./get-window";

type MetabaseProviderPropsStoreState = {
  props: MetabaseProviderPropsStoreExternalProps | null;
  internalProps: MetabaseProviderPropsStoreInternalProps;
};

export type MetabaseProviderPropsStoreExternalProps = Omit<
  ComponentProviderProps,
  "children" | keyof MetabaseProviderPropsStoreInternalProps
>;

export type MetabaseProviderPropsStoreInternalProps = {
  loadingPromise?: Promise<void> | null;
  loadingState?: SdkLoadingState;
  loadingError?: SdkLoadingError | null;
  reduxStore?: ComponentProviderProps["reduxStore"] | null;
  singleInstanceIdsMap?: Record<string, string[]>;
};

/**
 * IMPORTANT!
 * Any rename/removal change for fields is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
export type MetabaseProviderPropsStore = {
  getState(): MetabaseProviderPropsStoreState;
  subscribe(listener: () => void): () => void;
  initialize(initialProps: MetabaseProviderPropsStoreExternalProps): void;
  updateInternalProps(
    internalProps: Partial<MetabaseProviderPropsStoreInternalProps>,
  ): void;
  setProps(props: Partial<MetabaseProviderPropsStoreExternalProps>): void;
  cleanup(): void;
};

const KEY = "METABASE_PROVIDER_PROPS_STORE";

const getInitialState = (): MetabaseProviderPropsStoreState => ({
  internalProps: {
    loadingPromise: null,
    loadingState: SdkLoadingState.Initial,
    loadingError: null,
    reduxStore: null,
    singleInstanceIdsMap: {},
  },
  props: null,
});

const getDefaultProps =
  (): Partial<MetabaseProviderPropsStoreExternalProps> => ({
    allowConsoleLog: true,
  });

export function ensureMetabaseProviderPropsStore(): MetabaseProviderPropsStore {
  const win = getWindow();

  if (!win) {
    throw new Error("The store can only be used in a browser environment.");
  }

  if (win[KEY]) {
    return win[KEY];
  }

  let state = getInitialState();
  const listeners = new Set<() => void>();

  const store: MetabaseProviderPropsStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    initialize(initialProps) {
      state = {
        ...state,
        props: {
          ...getDefaultProps(),
          ...initialProps,
        },
      } as MetabaseProviderPropsStoreState;
    },
    updateInternalProps(internalProps) {
      state = {
        ...state,
        internalProps: {
          ...state.internalProps,
          ...internalProps,
        },
      } as MetabaseProviderPropsStoreState;

      listeners.forEach((callback) => callback());
    },
    setProps(props) {
      state = {
        ...state,
        props: {
          ...getDefaultProps(),
          ...props,
        },
      } as MetabaseProviderPropsStoreState;

      listeners.forEach((callback) => callback());
    },
    cleanup() {
      listeners.clear();
      delete win[KEY];
    },
  };

  win[KEY] = store;

  return store;
}
