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

export const SDK_SSO_DOCS_LINK =
  "https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md#authenticate-users-from-your-back-end";

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

  const isSSO = !!jwtProviderUri;
  const isApiKey = !!apiKey;

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
    .with({ isLocalhost: true, isApiKey: true, hasFeatureFlag: true }, () =>
      toWarning(PROBLEMS.API_KEYS_WITH_LICENSE),
    )
    .with({ isLocalhost: true, isApiKey: true, hasFeatureFlag: false }, () =>
      toWarning(PROBLEMS.API_KEYS_WITHOUT_LICENSE),
    )
    .with({ isApiKey: true, hasFeatureFlag: true }, () =>
      toError(PROBLEMS.API_KEYS_WITH_LICENSE),
    )
    .with({ isApiKey: true, hasFeatureFlag: false }, () =>
      toError(PROBLEMS.API_KEYS_WITHOUT_LICENSE),
    )
    .otherwise(() => null);
}

const toError = (message: string): SdkLicenseProblem => ({
  severity: "error",
  message,
});

const toWarning = (message: string): SdkLicenseProblem => ({
  severity: "warning",
  message,
});

const HEADER_STYLE = "color: #509ee3; font-size: 16px; font-weight: bold;";
const TEXT_STYLE = "color: #333; font-size: 14px;";
const LINK_STYLE =
  "color: #509ee3; font-size: 14px; text-decoration: underline;";

export function printLicenseProblemToConsole(
  problem: SdkLicenseProblem | null,
  appName: string,
) {
  if (!problem) {
    return;
  }

  const logger = match(problem.severity)
    .with("warning", () => console.warn)
    .with("error", () => console.error)
    .exhaustive();

  logger(
    `%c${appName} Embedding SDK for React\n\n` +
      `%c${problem.message}\n` +
      `See the documentation for more information:\n\n` +
      `%chttps://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md#authenticate-users-from-your-back-end\n\n`,
    HEADER_STYLE,
    TEXT_STYLE,
    LINK_STYLE,
  );
}
