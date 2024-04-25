type JWTAuthType = {
  jwtProviderUri: string;
};

type BaseSDKConfigType = {
  metabaseInstanceUrl: string;
  font?: string;
  jwtProviderUri?: string;
};

export type SdkConfigWithJWT = BaseSDKConfigType & JWTAuthType;

export type SDKConfigType = BaseSDKConfigType | SdkConfigWithJWT;
