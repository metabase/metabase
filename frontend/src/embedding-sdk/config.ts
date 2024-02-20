export const SDK_CONTEXT_CLASS_NAME = "metabase-sdk"; // this should be synced with webpack.embedding-sdk.config.js

export type SDKConfigType = {
  metabaseInstanceUrl: string;
  jwtProviderUri?: string;
  font?: string;
  apiKey?: string;
};
