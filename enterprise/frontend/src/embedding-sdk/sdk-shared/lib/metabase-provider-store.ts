import type { Action, Store } from "@reduxjs/toolkit";

import type { InternalMetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";
import { dispatchMetabaseProviderStoreInitializationEvent } from "embedding-sdk/sdk-wrapper/lib/private/dispatch-metabase-provider-store-initialization-event";
import type { SdkStoreState } from "embedding-sdk/store/types";

import { getWindow } from "./get-window";

export type MetabaseProviderPropsToStore = Omit<
  InternalMetabaseProviderProps,
  "children" | "store"
> & {
  store?: InternalMetabaseProviderProps["store"];
};

export class MetabaseProviderStore {
  private static instance: MetabaseProviderStore | null = null;

  private props: MetabaseProviderPropsToStore;

  private readonly listeners = new Set<() => void>();

  public static initialize(initialProps: MetabaseProviderPropsToStore): void {
    if (MetabaseProviderStore.instance) {
      return;
    }

    MetabaseProviderStore.instance = new MetabaseProviderStore(initialProps);

    const _window = getWindow();

    if (_window) {
      _window.METABASE_PROVIDER_STORE = MetabaseProviderStore;
    }

    Promise.resolve().then(() => {
      dispatchMetabaseProviderStoreInitializationEvent("initialized");
    });
  }

  public static cleanup(): void {
    if (!MetabaseProviderStore.instance) {
      return;
    }

    MetabaseProviderStore.instance = null;
    delete getWindow()?.METABASE_PROVIDER_STORE;

    Promise.resolve().then(() => {
      dispatchMetabaseProviderStoreInitializationEvent("uninitialized");
    });
  }

  public static getInstance(): MetabaseProviderStore | null {
    return (
      (getWindow()?.METABASE_PROVIDER_STORE ?? MetabaseProviderStore)
        ?.instance ?? null
    );
  }

  private constructor(initialProps: MetabaseProviderPropsToStore) {
    this.props = initialProps;

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  public getSnapshot(): MetabaseProviderPropsToStore {
    return this.props;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
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

  public setSdkStore(store: Store<SdkStoreState, Action>): void {
    this.update("store", store);
  }

  public getSdkStore() {
    return this.props.store;
  }
}
