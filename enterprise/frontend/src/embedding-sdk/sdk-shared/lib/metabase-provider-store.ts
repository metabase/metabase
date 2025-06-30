import type { Action, Store } from "@reduxjs/toolkit";

import type { MetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";
import type { SdkStoreState } from "embedding-sdk/store/types";

export type MetabaseProviderPropsToStore = Omit<
  MetabaseProviderProps,
  "children"
>;

export class MetabaseProviderStore {
  private static instance: MetabaseProviderStore | null = null;

  private props: MetabaseProviderPropsToStore;
  private sdkStore: Store<SdkStoreState, Action> | null = null;

  private readonly listeners = new Set<() => void>();

  public static initialize(initialProps: MetabaseProviderPropsToStore): void {
    if (MetabaseProviderStore.instance) {
      return;
    }

    MetabaseProviderStore.instance = new MetabaseProviderStore(initialProps);
    window.METABASE_PROVIDER_STORE = MetabaseProviderStore;
  }

  public static cleanup(): void {
    MetabaseProviderStore.instance = null;
    delete window.METABASE_PROVIDER_STORE;
  }

  public static getInstance(): MetabaseProviderStore | null {
    return (
      (window.METABASE_PROVIDER_STORE ?? MetabaseProviderStore)?.instance ??
      null
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
    this.sdkStore = store;
  }

  public getSdkStore() {
    return this.sdkStore;
  }
}
