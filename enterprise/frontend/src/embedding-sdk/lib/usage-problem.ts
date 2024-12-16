import { match } from "ts-pattern";

import type { MetabaseAuthConfig } from "embedding-sdk/types";
import type { SdkUsageProblem } from "embedding-sdk/types/usage-problem";

import { getIsLocalhost } from "./is-localhost";

interface SdkProblemOptions {
  authConfig: MetabaseAuthConfig;
  isEnabled: boolean;
  hasTokenFeature: boolean;
}

const PROBLEMS = {
  API_KEYS_WITHOUT_LICENSE: `The embedding SDK is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, a license is required and you need to implement SSO.`,
  API_KEYS_WITH_LICENSE: `The embedding SDK is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO.`,
  SSO_WITHOUT_LICENSE: `Usage without a valid license for this feature is only allowed for evaluation purposes, using API keys and only on localhost. Attempting to use this in other ways is in breach of our usage policy.`,
  CONFLICTING_AUTH_METHODS: `You cannot use both an Auth Provider URI and API key authentication at the same time.`,
  JWT_PROVIDER_URI_DEPRECATED: `The jwtProviderUri config property has been deprecated. Replace it with authProviderUri.`,

  // TODO: this message is pending on the "allowing CORS for /api/session/properties" PR to be merged
  NO_AUTH_METHOD_PROVIDED: `You must provide either an Auth Provider URI or an API key for authentication.`,

  EMBEDDING_SDK_NOT_ENABLED: `The embedding SDK is not enabled for this instance. Please enable it in settings to start using the SDK.`,
} as const;

export const SDK_SSO_DOCS_LINK =
  "https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md#authenticate-users-from-your-back-end";

/**
 * Determine whether is a problem with user's use case of the embedding sdk.
 * This is determined by their license and the auth method they are using.
 */
export function getSdkUsageProblem(
  options: SdkProblemOptions,
): SdkUsageProblem | null {
  const { isEnabled, hasTokenFeature, authConfig } = options;
  const { authProviderUri, apiKey } = authConfig;

  const isSSO = !!authProviderUri;
  const isApiKey = !!apiKey;
  const isLocalhost = getIsLocalhost();
  const hasJwtProviderUriProperty = "jwtProviderUri" in authConfig;

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
      hasJwtProviderUriProperty,
    })
      .with({ hasJwtProviderUriProperty: true }, () =>
        toError(PROBLEMS.JWT_PROVIDER_URI_DEPRECATED),
      )
      .with({ isSSO: false, isApiKey: false }, () =>
        toError(PROBLEMS.NO_AUTH_METHOD_PROVIDED),
      )
      .with({ isSSO: true, isApiKey: true }, () =>
        toError(PROBLEMS.CONFLICTING_AUTH_METHODS),
      )
      // For SSO, the token features and the toggle must both be enabled.
      .with({ isSSO: true, hasTokenFeature: true, isEnabled: true }, () => null)
      .with({ isSSO: true, hasTokenFeature: false, isLocalhost: true }, () =>
        toError(PROBLEMS.SSO_WITHOUT_LICENSE),
      )
      // For API keys, we allow evaluation usage without a license in localhost.
      // This allows them to test-drive the SDK in development.
      // API keys are always enabled regardless of the "enable-embedding" setting,
      // as it can only be used in localhost.
      .with({ isLocalhost: true, isApiKey: true, hasTokenFeature: true }, () =>
        toWarning(PROBLEMS.API_KEYS_WITH_LICENSE),
      )
      .with({ isLocalhost: true, isApiKey: true, hasTokenFeature: false }, () =>
        toWarning(PROBLEMS.API_KEYS_WITHOUT_LICENSE),
      )
      // We do not allow using API keys in production.
      .with({ isApiKey: true, hasTokenFeature: true }, () =>
        toError(PROBLEMS.API_KEYS_WITH_LICENSE),
      )
      .otherwise(() => null)
  );
}

const toError = (message: string): SdkUsageProblem => ({
  severity: "error",
  message,
});

const toWarning = (message: string): SdkUsageProblem => ({
  severity: "warning",
  message,
});
