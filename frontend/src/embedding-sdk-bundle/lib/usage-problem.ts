import { P, match } from "ts-pattern";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import type {
  SdkUsageProblem,
  SdkUsageProblemKey,
} from "embedding-sdk-bundle/types/usage-problem";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

import { getIsLocalhost } from "./get-is-localhost";

interface SdkProblemOptions {
  authConfig: MetabaseAuthConfig;
  isEnabled: boolean;
  isGuestEmbed: boolean | null;
  hasTokenFeature: boolean;
  isDevelopmentMode?: boolean;
  session: MetabaseEmbeddingSessionToken | null;
  /**
   * Indicates whether the current environment is localhost.
   * If not provided, it will be determined automatically based on window.location.
   *
   * @see getIsLocalhost()
   */
  isLocalHost?: boolean;
}

export const USAGE_PROBLEM_MESSAGES = {
  API_KEYS_WITHOUT_LICENSE: `This embed is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, a license is required and you need to implement SSO.`,
  API_KEYS_WITH_LICENSE: `This embed is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO.`,
  SSO_WITHOUT_LICENSE: `Usage without a valid license for this feature is only allowed for evaluation purposes, using API keys and only on localhost. Attempting to use this in other ways is in breach of our usage policy.`,

  // This message only works on localhost at the moment, as we cannot detect if embedding is disabled due to CORS restrictions on /api/session/properties.
  EMBEDDING_SDK_NOT_ENABLED: `Embedding is not enabled for this instance. Please enable it in settings.`,

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- only shown in development.
  DEVELOPMENT_MODE_CLOUD_INSTANCE: `This Metabase is in development mode intended exclusively for testing. Using this Metabase for everyday BI work or when embedding in production is considered unfair usage.`,
  JWT_EXP_NULL: `The JWT token is missing the "exp" (expiration) claim. We will disallow tokens without "exp" in a future release. Please add "exp" to the token payload.`,
} as const;

export const SDK_AUTH_DOCS_URL =
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- these links are used in the SDK banner which is only shown to developers
  "https://www.metabase.com/docs/latest/embedding/sdk/authentication#2-add-a-new-endpoint-to-your-backend-to-handle-authentication";

export const METABASE_UPGRADE_URL = "https://www.metabase.com/upgrade";

export const SDK_INTRODUCTION_DOCS_URL =
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- these links are used in the SDK banner which is only shown to developers
  "https://www.metabase.com/docs/latest/embedding/sdk/introduction#in-metabase";

/** Documentation for each kind of SDK usage problems */
export const USAGE_PROBLEM_DOC_URLS: Record<SdkUsageProblemKey, string> = {
  API_KEYS_WITHOUT_LICENSE: METABASE_UPGRADE_URL,
  API_KEYS_WITH_LICENSE: SDK_AUTH_DOCS_URL,
  SSO_WITHOUT_LICENSE: METABASE_UPGRADE_URL,
  EMBEDDING_SDK_NOT_ENABLED: SDK_INTRODUCTION_DOCS_URL,
  DEVELOPMENT_MODE_CLOUD_INSTANCE: METABASE_UPGRADE_URL,
  JWT_EXP_NULL: SDK_AUTH_DOCS_URL,
} as const;

/**
 * Determine whether is a problem with user's use case of the embedding sdk.
 * This is determined by their license and the auth method they are using.
 */
export function getSdkUsageProblem(
  options: SdkProblemOptions,
): SdkUsageProblem | null {
  const {
    isEnabled,
    isGuestEmbed,
    hasTokenFeature,
    authConfig,
    isDevelopmentMode,
    session,
    isLocalHost,
  } = options;
  const { apiKey } = authConfig;

  const isSSO = !apiKey;
  const isApiKey = !!apiKey;

  // getIsLocalhost() checks for localhost based on window.location,
  // but we want to allow overriding it via the isLocalHost parameter
  // in case of a local app running a distant MB instance
  const isLocalhost = isLocalHost ?? getIsLocalhost();

  if (isDevelopmentMode) {
    return toWarning("DEVELOPMENT_MODE_CLOUD_INSTANCE");
  }

  if (isGuestEmbed === null || isGuestEmbed) {
    return null;
  }

  /**
   * TODO: these checks for non-localhost environments are pending on
   *       the "allowing CORS for /api/session/properties" PR to be merged
   *
   * 1: (isSSO: true, isEnabled: false) -> PROBLEMS.EMBEDDING_SDK_NOT_ENABLED
   * 2: (isSSO: true, hasTokenFeature: false) -> PROBLEMS.SSO_WITHOUT_LICENSE
   * 3: (isApiKey: true, hasTokenFeature: false) -> PROBLEMS.API_KEYS_WITHOUT_LICENSE
   */
  return (
    match({
      hasTokenFeature,
      isSSO,
      isApiKey,
      isLocalhost,
      isEnabled,
      session,
    })
      .with({ isSSO: true, hasTokenFeature: false, isLocalhost: true }, () =>
        toError("SSO_WITHOUT_LICENSE"),
      )
      .with(
        {
          hasTokenFeature: true,
          isEnabled: false,
        },
        () => toError("EMBEDDING_SDK_NOT_ENABLED"),
      )
      // For API keys, we allow evaluation usage without a license in localhost.
      // This allows them to test-drive the SDK in development.
      // API keys are always enabled regardless of the "enable-embedding" setting,
      // as it can only be used in localhost.
      .with({ isLocalhost: true, isApiKey: true, hasTokenFeature: true }, () =>
        toWarning("API_KEYS_WITH_LICENSE"),
      )
      .with({ isLocalhost: true, isApiKey: true, hasTokenFeature: false }, () =>
        toWarning("API_KEYS_WITHOUT_LICENSE"),
      )
      // We do not allow using API keys in production.
      .with({ isApiKey: true, hasTokenFeature: true }, () =>
        toError("API_KEYS_WITH_LICENSE"),
      )
      .with({ session: { exp: P.nullish } }, () => toWarning("JWT_EXP_NULL"))
      .otherwise(() => null)
  );
}

const toError = (type: SdkUsageProblemKey): SdkUsageProblem => ({
  type,
  severity: "error",
  title: "Error",
  message: USAGE_PROBLEM_MESSAGES[type],
  documentationUrl: USAGE_PROBLEM_DOC_URLS[type],
});

const toWarning = (type: SdkUsageProblemKey): SdkUsageProblem => ({
  type,
  severity: "warning",
  title: getTitle(),
  message: USAGE_PROBLEM_MESSAGES[type],
  documentationUrl: USAGE_PROBLEM_DOC_URLS[type],
});

const getTitle = () => {
  if (isEmbeddingEajs()) {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- only shown in development or config error.
    return "This embed is powered by Metabase";
  }

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- only shown in development or config error.
  return "This embed is powered by the Metabase SDK.";
};
