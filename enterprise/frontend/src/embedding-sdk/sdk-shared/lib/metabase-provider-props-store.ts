import type { Action, Store } from "@reduxjs/toolkit";

import type { InternalMetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";
import { dispatchMetabaseProviderPropsStoreInitEvent } from "embedding-sdk/sdk-wrapper/lib/private/dispatch-metabase-provider-props-store-init-event";
import type { SdkStoreState } from "embedding-sdk/store/types";

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
  private static instance: MetabaseProviderPropsStore | null = null;

  private props: MetabaseProviderPropsToStore;
  private readonly listeners = new Set<() => void>();

  public static initialize(initialProps: MetabaseProviderPropsToStore): void {
    const existingStore = MetabaseProviderPropsStore.getInstance();

    if (existingStore) {
      // Don't initialize multiple instances of the store
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

  public static getInstance(): MetabaseProviderPropsStore | null {
    return (
      (getWindow()?.METABASE_PROVIDER_PROPS_STORE ?? MetabaseProviderPropsStore)
        ?.instance ?? null
    );
  }

  private constructor(initialProps: MetabaseProviderPropsToStore) {
    this.props = initialProps;

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  public updateProps(props: MetabaseProviderPropsToStore): void {
    this.props = { ...this.props, ...props };
    this.listeners.forEach((listener) => listener());
  }

  public update<K extends keyof MetabaseProviderPropsToStore>(
    key: K,
    value: MetabaseProviderPropsToStore[K],
  ): void {
    this.props = { ...this.props, [key]: value };
    this.listeners.forEach((listener) => listener());
  }

  public setReduxStore(reduxStore: Store<SdkStoreState, Action>): void {
    this.update("reduxStore", reduxStore);
  }

  public getReduxStore() {
    return this.props.reduxStore;
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
