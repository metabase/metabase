import type { InternalMetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";

import { getWindow } from "./get-window";

export type MetabaseProviderPropsToStore = Omit<
  InternalMetabaseProviderProps,
  "children" | "reduxStore"
> & { reduxStore?: InternalMetabaseProviderProps["reduxStore"] };

export type MetabaseProviderPropsStore = {
  getSnapshot(): MetabaseProviderPropsToStore | null;
  subscribe(fn: () => void): () => void;
  setProps(p: Partial<MetabaseProviderPropsToStore>): void;
  cleanup(): void;
};

const KEY = "METABASE_PROVIDER_PROPS_STORE";
export const EMPTY_PROPS = {} as MetabaseProviderPropsToStore;

export function ensureMetabaseProviderPropsStore(
  initial?: MetabaseProviderPropsToStore,
): MetabaseProviderPropsStore {
  const win = getWindow();

  if (!win) {
    throw new Error("The store can only be used in a browser environment.");
  }

  if (win[KEY]) {
    return win[KEY];
  }

  let props = initial ?? EMPTY_PROPS;
  const listeners = new Set<() => void>();

  const store: MetabaseProviderPropsStore = {
    getSnapshot: () => (Object.keys(props).length ? props : null),
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    setProps(propsToSet) {
      const next = { ...props, ...propsToSet };

      if (Object.is(next, props)) {
        return;
      }

      props = next;
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
