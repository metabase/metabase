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

export type LoginStatus =
  | { status: "success" }
  | { status: "loading" }
  | {
      status: "error";
      error: Error;
    }
  | null;
