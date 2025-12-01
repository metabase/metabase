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
   * Optional: Direct URI to the JWT provider endpoint.
   * If provided, skips the SSO discovery request, saving one round trip.
   *
   * Example: "https://your-backend.com/api/metabase-jwt"
   */
  jwtProviderUri?: string;

  /**
   * Optional: Disable early auth optimization in the package.
   * If true, the bundle will handle all auth.
   * Useful for debugging or when you want to control auth timing.
   *
   * @default false
   */
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
