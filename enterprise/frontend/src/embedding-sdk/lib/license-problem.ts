import { match } from "ts-pattern";
import { t } from "ttag";

import type { SDKConfig } from "embedding-sdk/types";
import type { SdkUsageProblem } from "embedding-sdk/types/license-problem";

import { getIsLocalhost } from "./is-localhost";

interface SdkProblemOptions {
  config: SDKConfig;

  isEnabled: boolean;
  hasTokenFeature: boolean;
}

const PROBLEMS = {
  API_KEYS_WITHOUT_LICENSE: t`The embedding SDK is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, a license is required and you need to implement SSO.`,
  API_KEYS_WITH_LICENSE: t`The embedding SDK is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO.`,
  SSO_WITHOUT_LICENSE: t`Usage without a valid license for this feature is only allowed for evaluation purposes, using API keys and only on localhost. Attempting to use this in other ways is in breach of our usage policy.`,
  CONFLICTING_AUTH_METHODS: t`You cannot use both JWT and API key authentication at the same time.`,
  NO_AUTH_METHOD_PROVIDED: t`You must provide either a JWT URI or an API key for authentication.`,
  EMBEDDING_SDK_NOT_ENABLED: t`The embedding SDK is not enabled for this instance. Please enable it in settings to start embedding.`,
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
  const {
    isEnabled,
    hasTokenFeature,
    config: { jwtProviderUri, apiKey },
  } = options;

  const isSSO = !!jwtProviderUri;
  const isApiKey = !!apiKey;
  const isLocalhost = getIsLocalhost();

  return (
    match({ hasTokenFeature, isSSO, isApiKey, isLocalhost, isEnabled })
      .with({ isSSO: false, isApiKey: false }, () =>
        toError(PROBLEMS.NO_AUTH_METHOD_PROVIDED),
      )
      .with({ isSSO: true, isApiKey: true }, () =>
        toError(PROBLEMS.CONFLICTING_AUTH_METHODS),
      )
      // For SSO, the token features and the toggle must both be enabled.
      .with({ isSSO: true, hasTokenFeature: true, isEnabled: true }, () => null)
      .with({ isSSO: true, hasTokenFeature: false }, () =>
        toError(PROBLEMS.SSO_WITHOUT_LICENSE),
      )
      .with({ isSSO: true, isEnabled: false }, () =>
        toError(PROBLEMS.EMBEDDING_SDK_NOT_ENABLED),
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
      .with({ isApiKey: true, hasTokenFeature: false }, () =>
        toError(PROBLEMS.API_KEYS_WITHOUT_LICENSE),
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
