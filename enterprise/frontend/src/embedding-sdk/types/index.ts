import type { JSX } from "react";

import type { FetchRequestTokenFn } from "embedding-sdk";
import type { SdkErrorProps } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";

export type SDKConfig = {
  metabaseInstanceUrl: string;
  jwtProviderUri: string;
  loaderComponent?: () => JSX.Element;
  errorComponent?: ({ message }: SdkErrorProps) => JSX.Element;

  /**
   * Specifies a function to fetch the refresh token.
   * The refresh token should be in the format of { id: string, exp: number }
   */
  fetchRequestToken?: FetchRequestTokenFn;
};
