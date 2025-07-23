import type { InternalMetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";
import { dispatchMetabaseProviderPropsStoreInitEvent } from "embedding-sdk/sdk-wrapper/lib/private/dispatch-metabase-provider-props-store-init-event";

import { getWindow } from "./get-window";

export type MetabaseProviderPropsToStore = Omit<
  InternalMetabaseProviderProps,
  "children" | "reduxStore"
> & {
  reduxStore?: InternalMetabaseProviderProps["reduxStore"];
};

/**
 * A singleton store that holds the props for the MetabaseProvider.
 * It is shared between the SDK package and the SDK Hosted Bundle.
 *
 * This class can be used with `useSyncExternalStore` to subscribe to changes in the props.
 */
export class MetabaseProviderPropsStore {
  public props: MetabaseProviderPropsToStore;

  private static instance: MetabaseProviderPropsStore | null = null;
  private readonly listeners = new Set<() => void>();

  public static getInstance(): MetabaseProviderPropsStore | null {
    if (!MetabaseProviderPropsStore.instance) {
      const instanceFromWindow =
        getWindow()?.METABASE_PROVIDER_PROPS_STORE?.instance;

      if (!instanceFromWindow) {
        return null;
      }

      MetabaseProviderPropsStore.instance = instanceFromWindow;
    }

    return MetabaseProviderPropsStore.instance;
  }

  public static initialize(initialProps: MetabaseProviderPropsToStore): void {
    const existingStore = MetabaseProviderPropsStore.getInstance();

    if (existingStore) {
      return;
    }

    MetabaseProviderPropsStore.instance = new MetabaseProviderPropsStore(
      initialProps,
    );

    const win = getWindow();

    if (win) {
      // Put the store to the global window object so it can be shared between the SDK package and SDK Hosted Bundle
      win.METABASE_PROVIDER_PROPS_STORE = MetabaseProviderPropsStore;
    }

    Promise.resolve().then(() => {
      dispatchMetabaseProviderPropsStoreInitEvent("initialized");
    });
  }

  public static cleanup(): void {
    if (!MetabaseProviderPropsStore.getInstance()) {
      return;
    }

    MetabaseProviderPropsStore.instance = null;
    delete getWindow()?.METABASE_PROVIDER_PROPS_STORE;

    Promise.resolve().then(() => {
      dispatchMetabaseProviderPropsStoreInitEvent("uninitialized");
    });
  }

  private constructor(initialProps: MetabaseProviderPropsToStore) {
    this.props = initialProps;

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  public setProps(props: Partial<MetabaseProviderPropsToStore>): void {
    this.props = { ...this.props, ...props };
    this.listeners.forEach((listener) => listener());
  }

  // -- useSyncExternalStore compatibility --

  public getSnapshot(): MetabaseProviderPropsToStore {
    return this.props;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}
