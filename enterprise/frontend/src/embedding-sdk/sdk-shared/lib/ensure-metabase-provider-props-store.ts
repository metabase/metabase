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
  reduxStore?: InternalMetabaseProviderProps["reduxStore"];
};

export type MetabaseProviderPropsStore = {
  getSnapshot(): MetabaseProviderPropsToStore | null;
  subscribe(fn: () => void): () => void;
  setProps(p: Partial<MetabaseProviderPropsToStore>): void;
  cleanup(): void;
};

const INTERNAL_PROP_NAMES: (keyof MetabaseProviderPropsStoreInternalProps)[] = [
  "initialized",
  "reduxStore",
];

const KEY = "METABASE_PROVIDER_PROPS_STORE";
const EMPTY_PROPS = {} as MetabaseProviderPropsToStore;

export function ensureMetabaseProviderPropsStore(
  initial?: MetabaseProviderPropsStoreExternalProps,
): MetabaseProviderPropsStore {
  const win = getWindow();

  if (!win) {
    throw new Error("The store can only be used in a browser environment.");
  }

  if (win[KEY]) {
    return win[KEY];
  }

  let props: MetabaseProviderPropsToStore = (initial ??
    EMPTY_PROPS) as MetabaseProviderPropsToStore;
  const listeners = new Set<() => void>();

  const store: MetabaseProviderPropsStore = {
    getSnapshot: () => (Object.keys(props).length ? props : null),
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    setProps(propsToSet) {
      const internalProps = Object.fromEntries(
        INTERNAL_PROP_NAMES.map((key) => [key, propsToSet[key] ?? props[key]]),
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
