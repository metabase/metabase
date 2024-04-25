import type { JSX } from "react";

type JWTAuthType = {
  jwtProviderUri: string;
};

type BaseSDKConfigType = {
  metabaseInstanceUrl: string;
  font?: string;
  jwtProviderUri?: string;
  loaderComponent?: () => JSX.Element;
  errorComponent?: () => JSX.Element;
};

export type SdkConfigWithJWT = BaseSDKConfigType & JWTAuthType;

export type SDKConfigType = BaseSDKConfigType | SdkConfigWithJWT;
