import { match } from "ts-pattern";
import { t } from "ttag";

import type { SDKConfig } from "embedding-sdk/types";
import type { SdkLicenseProblem } from "embedding-sdk/types/license-problem";

interface SdkProblemOptions {
  config: SDKConfig;
  hasFeatureFlag: boolean;
}

const PROBLEMS = {
  API_KEYS_WITHOUT_LICENSE: t`The embedding SDK is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, a license is required and you need to implement SSO.`,
  API_KEYS_WITH_LICENSE: t`The embedding SDK is using API keys. This is intended for evaluation purposes and works only on localhost. To use on other sites, implement SSO.`,
  SSO_WITHOUT_LICENSE: t`Usage without a valid license for this feature is only allowed for evaluation purposes, using API keys and only on localhost. Attempting to use this in other ways is in breach of our usage policy.`,
  CONFLICTING_AUTH_METHODS: t`You cannot use both JWT and API key authentication at the same time.`,
} as const;

/**
 * Determine whether is a problem with user's use case of the embedding sdk.
 * This is determined by their license and the auth method they are using.
 */
export function getSdkLicenseProblem(
  options: SdkProblemOptions,
): SdkLicenseProblem | null {
  const {
    hasFeatureFlag,
    config: { jwtProviderUri, apiKey },
  } = options;

  const isSSO = jwtProviderUri !== null && jwtProviderUri !== "";
  const isApiKey = apiKey !== null && apiKey !== "";

  const { hostname } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  return match({ hasFeatureFlag, isSSO, isApiKey, isLocalhost })
    .with({ isSSO: true, isApiKey: true }, () =>
      toError(PROBLEMS.CONFLICTING_AUTH_METHODS),
    )
    .with({ isSSO: true, hasFeatureFlag: true }, () => null)
    .with({ isSSO: true, hasFeatureFlag: false }, () =>
      toError(PROBLEMS.SSO_WITHOUT_LICENSE),
    )
    .with({ hasFeatureFlag: true, isApiKey: true, isLocalhost: true }, () =>
      toWarning(PROBLEMS.API_KEYS_WITH_LICENSE),
    )
    .with({ hasFeatureFlag: false, isApiKey: true, isLocalhost: true }, () =>
      toWarning(PROBLEMS.API_KEYS_WITHOUT_LICENSE),
    )
    .with({ hasFeatureFlag: true, isApiKey: true }, () =>
      toError(PROBLEMS.API_KEYS_WITH_LICENSE),
    )
    .with({ hasFeatureFlag: false, isApiKey: true }, () =>
      toError(PROBLEMS.API_KEYS_WITHOUT_LICENSE),
    )
    .otherwise(() => null);
}

const toError = (message: string): SdkLicenseProblem => ({
  level: "error",
  message,
});

const toWarning = (message: string): SdkLicenseProblem => ({
  level: "warning",
  message,
});
