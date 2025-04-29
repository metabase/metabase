import type { Action, Store } from "@reduxjs/toolkit";

import type { MetabaseTheme } from "embedding-sdk";
import type { SdkStoreState } from "embedding-sdk/store/types";

export type StoreWithSdkState = Store<SdkStoreState, Action>;

export type SdkIframeEmbedPostMessageAction =
  | {
      type: "metabase.embed.updateSettings";
      data: SdkIframeEmbedSettings;
    }
  | {
      type: "metabase.embed.authenticate";
    };

export type SdkIframeEmbedSettings = {
  dashboardId?: number | string;
  questionId?: number | string;
  notebookEditor?: boolean;
  theme?: MetabaseTheme;
  instanceUrl?: string;
  apiKey?: string;
};
