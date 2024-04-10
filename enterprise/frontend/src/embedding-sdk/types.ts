type SDKAuthType =
  | {
      authType: "apiKey";
      apiKey: string;
    }
  | {
      authType: "jwt";
      jwtProviderUri: string;
    };

export type SDKConfigType = {
  metabaseInstanceUrl: string;
  font?: string;
} & SDKAuthType;
