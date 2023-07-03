/**
 * Just because an instance is using an Enterprise artifact (jar or Docker image),
 * doesn't mean that the token is active or that it has all feature flags enabled.
 *
 * `isEE` means enterprise instance without a token.
 */
export const isEE = Cypress.env("IS_ENTERPRISE");
export const isOSS = !isEE;

const conditionalDescribe = cond => (cond ? describe : describe.skip);

export const describeEE = conditionalDescribe(isEE);
export const describeOSS = conditionalDescribe(isOSS);

/**
 *
 * @param {("all"|"none")} featuresScope
 */
export const setTokenFeatures = featuresScope => {
  let token;

  switch (featuresScope) {
    case "all":
      token = Cypress.env("ALL_FEATURES_TOKEN");
      break;
    case "none":
      token = Cypress.env("NO_FEATURES_TOKEN");
      break;

    default:
      token = "";
      break;
  }

  cy.log(`Set the "${featuresScope}" token`);
  return cy.request({
    method: "PUT",
    url: "/api/setting/premium-embedding-token",
    failOnStatusCode: false,
    body: {
      value: token,
    },
  });
};
