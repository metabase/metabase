import type {
  Action,
  AnyAction,
  SerializedError,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk-bundle/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type {
  InitializationStatus,
  SdkErrorComponent,
  SdkLoadingError,
} from "embedding-sdk-bundle/types/ui";
import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard.ts";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { State } from "metabase-types/store";

export type EmbeddingSessionTokenState = {
  token: MetabaseEmbeddingSessionToken | null;
  loading: boolean;
  error: SerializedError | null;
};

export type SdkInternalNavigationEntry = {
  type: "dashboard" | "question";
  id: number;
  name: string;
  parameters?: ParameterValues;
};

export type SdkStore = Omit<Store<SdkStoreState, Action>, "dispatch"> & {
  dispatch: SdkDispatch;
};

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkState = {
  isGuestEmbed: boolean | null;
  metabaseInstanceUrl: MetabaseAuthConfig["metabaseInstanceUrl"];
  metabaseInstanceVersion: string | null;
  token: EmbeddingSessionTokenState;
  initStatus: InitializationStatus;
  error: SdkLoadingError | null;
  plugins: null | MetabasePluginsConfig;
  eventHandlers: null | SdkEventHandlersConfig;
  usageProblem: null | SdkUsageProblem;
  errorComponent: null | SdkErrorComponent;
  fetchRefreshTokenFn: null | MetabaseAuthConfig["fetchRequestToken"];
  internalNavigationStack: SdkInternalNavigationEntry[];
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
