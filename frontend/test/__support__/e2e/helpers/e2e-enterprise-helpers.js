export const describeWithToken = Cypress.env("HAS_ENTERPRISE_TOKEN")
  ? describe
  : describe.skip;
