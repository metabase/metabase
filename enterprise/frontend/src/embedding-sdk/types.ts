type JWTAuthType = {
  authType: "jwt";
  jwtProviderUri: string;
};

type ApiKeyAuthType = {
  authType: "apiKey";
  apiKey: string;
};

type BaseSDKConfigType = {
  metabaseInstanceUrl: string;
  font?: string;
  authType?: string;
  jwtProviderUri?: string;
  apiKey?: string;
};

export type SdkConfigWithJWT = BaseSDKConfigType & JWTAuthType;
export type SdkConfigWithApiKey = BaseSDKConfigType & ApiKeyAuthType;

export type SDKConfigType =
  | BaseSDKConfigType
  | SdkConfigWithJWT
  | SdkConfigWithApiKey;
