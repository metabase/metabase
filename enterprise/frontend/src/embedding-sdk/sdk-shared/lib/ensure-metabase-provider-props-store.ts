import type { ComponentProviderProps } from "embedding-sdk/components/public/ComponentProvider";
import {
  type SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk/sdk-shared/types/sdk-loading";

import { getWindow } from "./get-window";

type MetabaseProviderPropsToStore = MetabaseProviderPropsStoreExternalProps &
  MetabaseProviderPropsStoreInternalProps;

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
  getSnapshot(): MetabaseProviderPropsToStore;
  subscribe(fn: () => void): () => void;
  initialize(initialProps: MetabaseProviderPropsStoreExternalProps): void;
  updateInternalProps(
    p: Partial<MetabaseProviderPropsStoreInternalProps>,
  ): void;
  setProps(p: Partial<MetabaseProviderPropsStoreExternalProps>): void;
  cleanup(): void;
};

const KEY = "METABASE_PROVIDER_PROPS_STORE";

const getInitialProps = (): MetabaseProviderPropsStoreInternalProps =>
  ({
    loadingPromise: null,
    loadingState: SdkLoadingState.Initial,
    loadingError: null,
    reduxStore: null,
    singleInstanceIdsMap: {},
  }) satisfies MetabaseProviderPropsStoreInternalProps;

const getInternalProps = (
  props: MetabaseProviderPropsToStore,
): MetabaseProviderPropsStoreInternalProps => ({
  loadingPromise: props.loadingPromise,
  loadingState: props.loadingState,
  loadingError: props.loadingError,
  reduxStore: props.reduxStore,
  singleInstanceIdsMap: props.singleInstanceIdsMap,
});

export function ensureMetabaseProviderPropsStore(): MetabaseProviderPropsStore {
  const win = getWindow();

  if (!win) {
    throw new Error("The store can only be used in a browser environment.");
  }

  if (win[KEY]) {
    return win[KEY];
  }

  let props = getInitialProps() as MetabaseProviderPropsToStore;
  const listeners = new Set<() => void>();

  const store: MetabaseProviderPropsStore = {
    getSnapshot: () => props,
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    initialize(initialProps) {
      props = {
        ...getInternalProps(props),
        ...initialProps,
      } as MetabaseProviderPropsToStore;
    },
    updateInternalProps(propsToSet) {
      props = {
        ...props,
        ...propsToSet,
      } as MetabaseProviderPropsToStore;

      listeners.forEach((callback) => callback());
    },
    setProps(propsToSet) {
      props = {
        ...getInternalProps(props),
        ...propsToSet,
      } as MetabaseProviderPropsToStore;

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
