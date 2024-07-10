import type { JSX } from "react";

import type { SdkErrorProps } from "embedding-sdk/components/private/PublicComponentWrapper/SdkError";
import type { EmbeddingSessionTokenState } from "embedding-sdk/store/types";

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

export type FetchRequestTokenFn = (
  url: string,
) => Promise<EmbeddingSessionTokenState["token"]>;
