import type { JSX } from "react";

import type { FetchRequestTokenFn } from "embedding-sdk";
import type { SdkErrorProps } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";

type BaseSDKConfig = {
  metabaseInstanceUrl: string;
  loaderComponent?: () => JSX.Element;
  errorComponent?: ({ message }: SdkErrorProps) => JSX.Element;

  /**
   * Specifies a function to fetch the refresh token.
   * The refresh token should be in the format of { id: string, exp: number }
   */
  fetchRequestToken?: FetchRequestTokenFn;
};

export type SDKConfigWithJWT = BaseSDKConfig & {
  jwtProviderUri: string;
  apiKey?: never;
};

export type SDKConfigWithApiKey = BaseSDKConfig & {
  apiKey: string;
  jwtProviderUri?: never;
};

export type SDKConfig = SDKConfigWithJWT | SDKConfigWithApiKey;
