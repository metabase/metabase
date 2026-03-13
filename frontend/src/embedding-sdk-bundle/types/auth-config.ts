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
   * Uri of the jwt provider. If provided the sdk will use jwt and will skip the first `/auth/sso` discovery request.
   */
  jwtProviderUri?: string;

  /**
   * Specifies a function to fetch the refresh token.
   * The refresh token should be in the format of {@link UserBackendJwtResponse}
   */
  fetchRequestToken?: MetabaseFetchRequestTokenFn;

  isGuest?: false;
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
  isGuest?: false;
  apiKey?: never;
  fetchRequestToken?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
  isGuest?: false;
  preferredAuthMethod?: never;
  fetchRequestToken?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseIsGuestAuthConfig = BaseMetabaseAuthConfig & {
  /**
   * Defines if SDK should work in a Guest Embed mode
   */
  isGuest: true;

  /**
   * Optional URL endpoint that returns new JWT tokens for guest embeds.
   * When configured, the SDK will automatically refresh expired tokens
   * by POSTing the expired token to this endpoint.
   * The endpoint should return { jwt: string } with the new token.
   */
  guestEmbedJwtRefreshUrl?: string;

  apiKey?: never;
  preferredAuthMethod?: never;
  fetchRequestToken?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfig =
  | MetabaseAuthConfigWithApiKey
  | MetabaseAuthConfigWithJwt
  | MetabaseAuthConfigWithSaml
  | MetabaseIsGuestAuthConfig;

export type MetabaseAuthMethod = Exclude<
  MetabaseAuthConfig["preferredAuthMethod"],
  undefined
>;
