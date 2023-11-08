export const describeWithToken = Cypress.env("HAS_ENTERPRISE_TOKEN")
  ? describe
  : describe.skip;

export const describeWithoutToken = !Cypress.env("HAS_ENTERPRISE_TOKEN")
  ? describe
  : describe.skip;
