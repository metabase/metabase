import type { Settings } from "../../../../frontend/src/metabase-types/api/settings";

export const putSetting = <
  TKey extends keyof Settings,
  TValue extends Settings[TKey],
>(
  setting: TKey,
  value: TValue,
): Cypress.Chainable => {
  return cy.request("PUT", `/api/setting/${setting}`, { value });
};
