import type { Settings } from "metabase-types/api";

export const updateSetting = <
  TKey extends keyof Settings,
  TValue extends Settings[TKey],
>(
  setting: TKey,
  value: TValue,
): Cypress.Chainable<Cypress.Response<never>> => {
  // TODO: remove before merging integration branch
  if (setting === "enable-embedding-static") {
    updateSetting("enable-embedding", value as boolean);
  }

  return cy.request<never>("PUT", `/api/setting/${setting}`, { value });
};
