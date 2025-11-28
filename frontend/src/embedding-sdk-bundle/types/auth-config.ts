import type { MetabaseFetchRequestTokenFn } from "metabase/embedding-sdk/types/refresh-token";

/**
 * @inline
 */
type BaseMetabaseAuthConfig = {
  metabaseInstanceUrl: string;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithJwt = BaseMetabaseAuthConfig & {
  /**
   * Which authentication method to use.
   * If both SAML and JWT are enabled at the same time,
   * it defaults to SAML unless the preferredAuthMethod is specified.
   */
  preferredAuthMethod?: "jwt";

  /**
   * Specifies a function to fetch the refresh token.
   * The refresh token should be in the format of {@link UserBackendJwtResponse}
   */
  fetchRequestToken?: MetabaseFetchRequestTokenFn;

  /**
   * The URL of the JWT provider endpoint on your backend.
   * When provided, the SDK skips the /auth/sso discovery request,
   * saving one round trip during authentication.
   */
  jwtProviderUri?: string;

  skipPackageAuth?: boolean;

  apiKey?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithSaml = BaseMetabaseAuthConfig & {
  /**
   * Which authentication method to use.
   * If both SAML and JWT are enabled at the same time,
   * it defaults to SAML unless the preferredAuthMethod is specified.
   */
  preferredAuthMethod?: "saml";
  apiKey?: never;
  fetchRequestToken?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
  preferredAuthMethod?: never;
  fetchRequestToken?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfig =
  | MetabaseAuthConfigWithApiKey
  | MetabaseAuthConfigWithJwt
  | MetabaseAuthConfigWithSaml;

export type MetabaseAuthMethod = Exclude<
  MetabaseAuthConfig["preferredAuthMethod"],
  undefined
>;
