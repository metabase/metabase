/**
 * Just because an instance is using an Enterprise artifact (jar or Docker image),
 * doesn't mean that the token is active or that it has all feature flags enabled.
 *
 * `isEE` means enterprise instance without a token and `isOSS` means open-source instance.
 * In the same way, custom `describe` blocks `describeEE` and `describeOSS` are used to
 * conditionally run tests only against a corresponding Metabase instance.
 *
 * There is a subset of UI elements that appear only in an open-source instance. Test those
 * using a `describeOSS` block, and vice-versa.
 *
 */
export const isEE = Cypress.env("IS_ENTERPRISE");
export const isOSS = !isEE;

/**
 *
 * @param {boolean} cond
 */
const conditionalDescribe = cond => (cond ? describe : describe.skip);

export const describeEE = conditionalDescribe(isEE);
export const describeOSS = conditionalDescribe(isOSS);

/**
 *
 * @param {("all"|"none")} featuresScope
 */
export const setTokenFeatures = featuresScope => {
  if (!isEE) {
    throw new Error(
      "You must run Metabase® Enterprise Edition™ for token to make sense.\nMake sure you have `MB_EDITION=ee` in your environment variables.",
    );
  }

  let token;

  switch (featuresScope) {
    case "all":
      token = Cypress.env("ALL_FEATURES_TOKEN");
      break;
    case "none":
      token = Cypress.env("NO_FEATURES_TOKEN");
      break;

    default:
      throw new Error(
        'You must set the token features scope to either "all" or "none"!',
      );
  }

  if (token === undefined) {
    throw new Error(
      "Please make sure you have correctly set the `CYPRESS_ALL_FEATURES_TOKEN` and/or `CYPRESS_NO_FEATURES_TOKEN` in your environment variables.",
    );
  }

  cy.log(`Set the token with features: "${featuresScope}"`);
  return cy.request({
    method: "PUT",
    url: "/api/setting/premium-embedding-token",
    failOnStatusCode: false,
    body: {
      value: token,
    },
  });
};
