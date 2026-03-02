import type { EnterpriseSettings, Settings } from "metabase-types/api";

export const updateSetting = <
  TKey extends keyof Settings,
  TValue extends Settings[TKey],
>(
  setting: TKey,
  value: TValue,
): Cypress.Chainable<Cypress.Response<never>> => {
  return cy.request<never>("PUT", `/api/setting/${setting}`, { value });
};

export const updateEnterpriseSetting = <
  TKey extends keyof EnterpriseSettings,
  TValue extends EnterpriseSettings[TKey],
>(
  setting: TKey,
  value: TValue,
): Cypress.Chainable<Cypress.Response<never>> => {
  return cy.request<never>("PUT", `/api/setting/${setting}`, { value });
};

export const updateEnterpriseSettings = <
  TKey extends keyof EnterpriseSettings,
  TValue extends EnterpriseSettings[TKey],
>(
  settings: Record<TKey, TValue>,
): Cypress.Chainable<Cypress.Response<never>> => {
  return cy.request<never>("PUT", "/api/setting", settings);
};
