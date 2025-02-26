/**
 * Just because an instance is using an Enterprise artifact (jar or Docker image),
 * doesn't mean that the token is active or that it has all feature flags enabled.
 *
 * `IS_ENTERPRISE` means enterprise instance without a token and `isOSS` means open-source instance.
 */
const { IS_ENTERPRISE } = Cypress.env();

/**
 *
 * @param {("all"|"none")} featuresScope
 */
export const setTokenFeatures = featuresScope => {
  if (!IS_ENTERPRISE) {
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

export const deleteToken = () => {
  if (!IS_ENTERPRISE) {
    throw new Error(
      "You must run Metabase® Enterprise Edition™ for token to make sense.\nMake sure you have `MB_EDITION=ee` in your environment variables.",
    );
  }
  return cy.request({
    method: "PUT",
    url: "/api/setting/premium-embedding-token",
    failOnStatusCode: false,
    body: {
      value: null,
    },
  });
};

export const mockSessionPropertiesTokenFeatures = features => {
  cy.intercept({ method: "GET", url: "/api/session/properties" }, request => {
    request.on("response", response => {
      if (typeof response.body === "object") {
        response.body = {
          ...response.body,
          "token-features": {
            ...response.body["token-features"],
            ...features,
          },
        };
      }
    });
  });
};

// Gets an object that reflects a *partial* premium feature error - it must
// be a partial, otherwise we would need to have a stack trace in this error
// object.
export const getPartialPremiumFeatureError = name => ({
  cause: `${name} is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/`,
  data: {
    "status-code": 402,
    status: "error-premium-feature-not-available",
  },
  message: `${name} is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/`,
  status: "error-premium-feature-not-available",
});
