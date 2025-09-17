import { match } from "ts-pattern";

/**
 * Just because an instance is using an Enterprise artifact (jar or Docker image),
 * doesn't mean that the token is active or that it has all feature flags enabled.
 *
 * `IS_ENTERPRISE` means enterprise instance without a token and `isOSS` means open-source instance.
 */
const { IS_ENTERPRISE } = Cypress.env();

const throwIfNotEnterprise = () => {
  if (!IS_ENTERPRISE) {
    throw new Error(
      "You must run Metabase® Enterprise Edition™ for token to make sense.\nMake sure you have `MB_EDITION=ee` in your environment variables.",
    );
  }
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

  const fallbackToken =
    tokenReference === "starter" ? "NO_FEATURES_TOKEN" : "ALL_FEATURES_TOKEN";
  const token = Cypress.env(tokenReference) || Cypress.env(fallbackToken);

  if (!token) {
    const errorMessage = `
    Please make sure you have correctly set the following tokens in your environment variables:
      - CYPRESS_MB_ALL_FEATURES_TOKEN
      - CYPRESS_MB_STARTER_CLOUD_TOKEN
      - CYPRESS_MB_PRO_CLOUD_TOKEN
      - CYPRESS_MB_PRO_SELF_HOSTED_TOKEN
    `;
    throw new Error(errorMessage);
  }

  cy.log(`Set the "${tokenReference}" token`);
  return cy.request({
    method: "PUT",
    url: "/api/setting/premium-embedding-token",
    failOnStatusCode: false,
    body: {
      value: token,
    },
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
