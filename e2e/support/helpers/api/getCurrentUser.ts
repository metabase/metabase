import type { User } from "metabase-types/api";

export const getCurrentUser = (): Cypress.Chainable<Cypress.Response<User>> => {
  return cy.request<User>("GET", "/api/user/current");
};
