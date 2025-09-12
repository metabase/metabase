import type {
  MetabaseFetchRequestTokenFn,
  MetabaseFetchStaticTokenFn,
} from "embedding-sdk-bundle/types/refresh-token";

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

  apiKey?: never;
  fetchStaticToken?: never;
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
  fetchStaticToken?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseAuthConfigWithApiKey = BaseMetabaseAuthConfig & {
  apiKey: string;
  preferredAuthMethod?: never;
  fetchRequestToken?: never;
  fetchStaticToken?: never;
};

/**
 * @category MetabaseProvider
 */
export type MetabaseStaticAuthConfig = BaseMetabaseAuthConfig & {
  /**
   * Fetches a static token for static (no-user) embedding
   */
  fetchStaticToken: MetabaseFetchStaticTokenFn;

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
  | MetabaseStaticAuthConfig;

export type MetabaseAuthMethod = Exclude<
  MetabaseAuthConfig["preferredAuthMethod"],
  undefined
>;
