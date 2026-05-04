/** Set up Cypress intercepts for the cache config endpoints. */
export const interceptPerformanceRoutes = () => {
  cy.intercept("POST", "/api/dataset").as("dataset");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  cy.intercept("PUT", "/api/cache").as("putCacheConfig");
  cy.intercept("DELETE", "/api/cache").as("deleteCacheConfig");
  cy.intercept("GET", "/api/cache?model=*&id=*").as("getCacheConfig");
  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
    "dashcardQuery",
  );
  cy.intercept("POST", "/api/persist/enable").as("enablePersistence");
  cy.intercept("POST", "/api/persist/disable").as("disablePersistence");
  cy.intercept("POST", "/api/cache/invalidate?include=overrides&database=*").as(
    "invalidateCacheForSampleDatabase",
  );
  cy.intercept("POST", "/api/cache/invalidate?*").as("invalidateCache");
};

export const cacheStrategySidesheet = () =>
  cy.findByRole("dialog", { name: /Caching settings/ }).should("be.visible");

export const durationRadioButton = () =>
  cy
    .findByRole("form", { name: "Select the cache invalidation policy" })
    .findByRole("radio", { name: /Duration/ });
