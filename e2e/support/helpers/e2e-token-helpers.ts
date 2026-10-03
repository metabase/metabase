import { match } from "ts-pattern";

/**
 * Just because an instance is using an Enterprise artifact (jar or Docker image),
 * doesn't mean that the token is active or that it has all feature flags enabled.
 *
 * `IS_ENTERPRISE` means enterprise instance without a token and `isOSS` means open-source instance.
 */
const IS_ENTERPRISE = Cypress.expose("IS_ENTERPRISE");

const throwIfNotEnterprise = () => {
  if (!IS_ENTERPRISE) {
    throw new Error(
      "You must run Metabase® Enterprise Edition™ for token to make sense.\nMake sure you have `MB_EDITION=ee` in your environment variables.",
    );
  }
};

const TOKEN_ACTIVATION_ATTEMPTS = 3;

const putTokenWithRetry = (
  token: string,
  attempt = 1,
): Cypress.Chainable<Cypress.Response<unknown>> => {
  return cy
    .request({
      method: "PUT",
      url: "/api/setting/premium-embedding-token",
      failOnStatusCode: false,
      body: {
        value: token,
      },
    })
    .then((response) => {
      if (response.status >= 200 && response.status < 300) {
        return cy.wrap(response, { log: false });
      }

      if (attempt >= TOKEN_ACTIVATION_ATTEMPTS) {
        throw new Error(
          `Failed to activate the token after ${attempt} attempts: ` +
            `${response.status} ${JSON.stringify(response.body)}`,
        );
      }

      cy.log(
        `Token activation failed with status ${response.status}, retrying`,
      );
      return putTokenWithRetry(token, attempt + 1);
    });
};

export const activateToken = (
  tokenName: "bleeding-edge" | "starter" | "pro-cloud" | "pro-self-hosted",
) => {
  throwIfNotEnterprise();

  const tokenReference = match(tokenName)
    .with("bleeding-edge", () => "MB_ALL_FEATURES_TOKEN")
    .with("starter", () => "MB_STARTER_CLOUD_TOKEN")
    .with("pro-cloud", () => "MB_PRO_CLOUD_TOKEN")
    .with("pro-self-hosted", () => "MB_PRO_SELF_HOSTED_TOKEN")
    .exhaustive();

  // Use cy.env() for sensitive token values (async API)
  return cy.env([tokenReference]).then((envVars) => {
    const token = envVars[tokenReference];

    if (!token) {
      throw new Error(
        `Missing CYPRESS_${tokenReference} environment variable for "${tokenName}" token`,
      );
    }

    cy.log(`Set the "${tokenName}" token`);
    return putTokenWithRetry(token);
  });
};

export const deleteToken = () => {
  throwIfNotEnterprise();

  return cy.request({
    method: "PUT",
    url: "/api/setting/premium-embedding-token",
    failOnStatusCode: false,
    body: {
      value: null,
    },
  });
};
