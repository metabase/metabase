import type { MetabaseFetchRequestTokenFn } from "embedding-sdk";

/**
 * @inline
 */
type BaseMetabaseAuthConfig = {
  metabaseInstanceUrl: string;

  /**
   * Specifies a function to fetch the refresh token.
   * The refresh token should be in the format of {@link UserBackendJwtResponse}
   */
  fetchRequestToken?: MetabaseFetchRequestTokenFn;

  /**
   * Preferred authentication method.
   * This should be provided when the instance has more than one configured authentication method.
   */
  preferredAuthMethod?: MetabasePreferredAuthMethod;
};

/**
 * @category MetabaseProvider
 **/
export type MetabasePreferredAuthMethod = "saml" | "jwt";

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithSSO = BaseMetabaseAuthConfig & {
  apiKey?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfig =
  | MetabaseAuthConfigWithSSO
  | MetabaseAuthConfigWithApiKey;
