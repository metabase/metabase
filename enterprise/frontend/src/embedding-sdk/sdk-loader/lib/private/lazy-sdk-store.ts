import type { Action, Store } from "@reduxjs/toolkit";

import type { SdkStoreState } from "embedding-sdk/store/types";

export class MetabaseProviderStore {
  private static instance: MetabaseProviderStore | null = null;

  private sdkStore: Store<SdkStoreState, Action> | null = null;

  public static initialize(): void {
    MetabaseProviderStore.instance = new MetabaseProviderStore();
    window.METABASE_PROVIDER_STORE = MetabaseProviderStore;
  }

  public static cleanup(): void {
    MetabaseProviderStore.instance = null;
    window.METABASE_PROVIDER_STORE = undefined;
  }

  public static getInstance(): MetabaseProviderStore | null {
    return MetabaseProviderStore.instance ?? null;
  }

  public setSdkStore(store: Store<SdkStoreState, Action>): void {
    this.sdkStore = store;
  }

  public getSdkStore() {
    return this.sdkStore;
  }
}
