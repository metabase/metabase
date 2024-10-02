import type { Settings } from "metabase-types/api";

export const updateSetting = <
  TKey extends keyof Settings,
  TValue extends Settings[TKey],
>(
  setting: TKey,
  value: TValue,
): Cypress.Chainable<Cypress.Response<never>> => {
  cy.log(`Updating ${setting} with value: ${value}`);
  return cy.request<never>("PUT", `/api/setting/${setting}`, { value });
};
