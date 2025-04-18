import type { MetabaseFetchRequestTokenFn } from "embedding-sdk";

type BaseMetabaseAuthConfig = {
  metabaseInstanceUrl: string;

  /**
   * Specifies a function to fetch the refresh token.
   * The refresh token should be in the format of { id: string, exp: number }
   */
  fetchRequestToken?: MetabaseFetchRequestTokenFn;
};

export type MetabaseAuthConfigWithProvider = BaseMetabaseAuthConfig & {
  apiKey?: never;
};

export type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfig =
  | MetabaseAuthConfigWithProvider
  | MetabaseAuthConfigWithApiKey;
