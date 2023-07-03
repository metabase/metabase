Cypress.Commands.add("setTokenFeatures", featuresScope => {
  let token;

  switch (featuresScope) {
    case "all":
      Cypress.env("activeToken", "premium");
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
});
