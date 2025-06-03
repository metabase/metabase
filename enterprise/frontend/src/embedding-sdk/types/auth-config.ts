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
   * Which authentication method to use.
   * If both SAML and JWT are enabled at the same time,
   * it defaults to SAML unless the authMethod is specified.
   */
  authMethod?: MetabaseAuthMethod;
};

/**
 * @inline
 **/
export type MetabaseAuthMethod = "saml" | "jwt";

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
