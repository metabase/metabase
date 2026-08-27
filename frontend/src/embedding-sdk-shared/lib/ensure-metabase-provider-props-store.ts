import { type SdkLoadingError, SdkLoadingState } from "../types/sdk-loading";

import { getWindow } from "./get-window";

type MetabaseProviderPropsStoreState<TProps, TStore> = {
  props: TProps | null;
  internalProps: MetabaseProviderPropsStoreInternalProps<TStore>;
};

export type MetabaseProviderPropsStoreInternalProps<TStore = unknown> = {
  loadingPromise?: Promise<void> | null;
  loadingState?: SdkLoadingState;
  loadingError?: SdkLoadingError | null;
  /** The bundle's redux store. Opaque here; the bundle owns its type. */
  reduxStore?: TStore | null;
  singleInstanceIdsMap?: Record<string, string[]>;
  dataApp?: { name: string; isDev?: boolean } | null;
};

/**
 * IMPORTANT!
 * Any rename/removal change for fields is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 *
 * The props payload is opaque here. The bundle and the npm package both
 * instantiate `TProps` with the bundle's external provider props, so this
 * module never imports the bundle's types.
 */
export type MetabaseProviderPropsStore<TProps = unknown, TStore = unknown> = {
  getState(): MetabaseProviderPropsStoreState<TProps, TStore>;
  subscribe(listener: () => void): () => void;
  updateInternalProps(
    internalProps: Partial<MetabaseProviderPropsStoreInternalProps<TStore>>,
  ): void;
  setProps(props: Partial<TProps>): void;
  cleanup(): void;
};

const KEY = "METABASE_PROVIDER_PROPS_STORE";

const getInitialState = <TProps, TStore>(): MetabaseProviderPropsStoreState<
  TProps,
  TStore
> => ({
  internalProps: {
    loadingPromise: null,
    loadingState: SdkLoadingState.Initial,
    loadingError: null,
    reduxStore: null,
    singleInstanceIdsMap: {},
  },
  props: null,
});

const getDefaultProps = () => ({
  allowConsoleLog: true,
});

export function ensureMetabaseProviderPropsStore<
  TProps = unknown,
  TStore = unknown,
>(): MetabaseProviderPropsStore<TProps, TStore> {
  const win = getWindow();

  if (!win) {
    throw new Error("The store can only be used in a browser environment.");
  }

  if (win[KEY]) {
    // The window holds one untyped singleton; the caller picks the props type,
    // and every caller compiles against the same bundle version.
    return win[KEY] as MetabaseProviderPropsStore<TProps, TStore>;
  }

  let state = getInitialState<TProps, TStore>();
  const listeners = new Set<() => void>();

  const store: MetabaseProviderPropsStore<TProps, TStore> = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    updateInternalProps(internalProps) {
      state = {
        ...state,
        internalProps: {
          ...state.internalProps,
          ...internalProps,
        },
      };

      listeners.forEach((callback) => callback());
    },
    setProps(props) {
      // The defaults and the partial update cannot be proven to add up to a
      // complete TProps; the endpoints treat the accumulated props as complete.
      state = {
        ...state,
        props: {
          ...getDefaultProps(),
          ...props,
        },
      } as MetabaseProviderPropsStoreState<TProps, TStore>;

      listeners.forEach((callback) => callback());
    },
    cleanup() {
      // Reset state in place rather than dropping the singleton. Subscribers
      // (e.g. consumers of `useMetabaseAuthStatus` rendered as siblings of
      // `<MetabaseProvider>`) keep their useSyncExternalStore subscriptions —
      // a deleted-singleton cleanup orphans them on the abandoned store and
      // they never see updates from the next mount cycle.
      state = getInitialState<TProps, TStore>();
      listeners.forEach((callback) => callback());
    },
  };

  // The singleton is stored untyped; see the cast above.
  win[KEY] = store as MetabaseProviderPropsStore;

  return store;
}
