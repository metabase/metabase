export const SDK_CONTEXT_CLASS_NAME = "metabase-sdk"; // this should be synced with webpack.embedding-sdk.config.js

export type SDKConfigType = {
  metabaseInstanceUrl: string;
  font?: string;
} & (
  | {
      authType: "jwt";
      jwtProviderUri: string;
    }
  | {
      authType: "apiKey";
      apiKey: string;
    }
);
