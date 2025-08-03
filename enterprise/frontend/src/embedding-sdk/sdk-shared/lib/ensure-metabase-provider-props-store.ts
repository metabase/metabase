import type { InternalMetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";

import { getWindow } from "./get-window";

type MetabaseProviderPropsToStore = MetabaseProviderPropsStoreExternalProps &
  MetabaseProviderPropsStoreInternalProps;

export type MetabaseProviderPropsStoreExternalProps = Omit<
  InternalMetabaseProviderProps,
  "children" | keyof MetabaseProviderPropsStoreInternalProps
>;

export type MetabaseProviderPropsStoreInternalProps = {
  initialized?: boolean;
  reduxStore?: InternalMetabaseProviderProps["reduxStore"] | null;
  singleCopyWrapperIdsMap?: Record<string, string[]>;
};

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

const INTERNAL_PROP_NAMES: (keyof MetabaseProviderPropsStoreInternalProps)[] = [
  "initialized",
  "reduxStore",
  "singleCopyWrapperIdsMap",
];

const KEY = "METABASE_PROVIDER_PROPS_STORE";
const EMPTY_PROPS = {
  initialized: false,
  reduxStore: null,
  singleCopyWrapperIdsMap: {},
} as MetabaseProviderPropsStoreInternalProps;

export function ensureMetabaseProviderPropsStore(): MetabaseProviderPropsStore {
  const win = getWindow();

  if (!win) {
    throw new Error("The store can only be used in a browser environment.");
  }

  if (win[KEY]) {
    return win[KEY];
  }

  let props: MetabaseProviderPropsToStore =
    EMPTY_PROPS as MetabaseProviderPropsToStore;
  const listeners = new Set<() => void>();

  const store: MetabaseProviderPropsStore = {
    getSnapshot: () => props,
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    initialize(initialProps) {
      const internalProps = Object.fromEntries(
        INTERNAL_PROP_NAMES.map((key) => [key, props[key]]),
      ) as MetabaseProviderPropsStoreInternalProps;

      props = {
        ...internalProps,
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
      const internalProps = Object.fromEntries(
        INTERNAL_PROP_NAMES.map((key) => [key, props[key]]),
      ) as MetabaseProviderPropsStoreInternalProps;

      props = {
        ...internalProps,
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
