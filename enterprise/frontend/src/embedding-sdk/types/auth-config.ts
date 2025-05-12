import type { MetabaseFetchRequestTokenFn } from "embedding-sdk";

/**
 * @inline
 */
type BaseMetabaseAuthConfig = {
  metabaseInstanceUrl: string;

  /**
   * Specifies a function to fetch the refresh token.
   * The refresh token should be in the format of { id: string, exp: number }
   */
  fetchRequestToken?: MetabaseFetchRequestTokenFn;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithProvider = BaseMetabaseAuthConfig & {
  authProviderUri: string;
  apiKey?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
  authProviderUri?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfig =
  | MetabaseAuthConfigWithProvider
  | MetabaseAuthConfigWithApiKey;
