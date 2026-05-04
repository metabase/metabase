/** Intercept routes for caching tests */
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

/** Cypress log messages sometimes occur out of order so it is helpful to log to the console as well. */
export const log = (message: string) => {
  cy.log(message);
  console.log(message);
};

export const goToPerformancePage = (
  name:
    | "Database caching"
    | "Dashboard and question caching"
    | "Model persistence",
) => {
  cy.findByTestId("admin-layout-sidebar").findByText(name).click();
};

export const advanceServerClockBy = (milliseconds: number) => {
  log(`Advancing clock by ${milliseconds}ms`);
  return cy.request("POST", "/api/testing/set-time", {
    "add-ms": milliseconds,
  });
};
