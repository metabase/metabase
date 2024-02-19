export const SDK_CONTEXT_CLASS_NAME = "metabase-sdk"; // this should be synced with webpack.embedding-sdk.config.js

export type SDKConfigType = {
  metabaseInstanceUrl: string;
  jwtProviderUri?: string;
  font?: string;
  apiKey?: string;
};

export const METABASE_SDK_CONFIG: SDKConfigType = {
  metabaseInstanceUrl: "http://localhost:3000",
  font: "Lato",
};
