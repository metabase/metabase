import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(duration);
dayjs.extend(relativeTime);

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

export const databaseCachingPage = () =>
  cy.findByRole("tabpanel", { name: "Database caching" });

export const visitDashboardAndQuestionCachingTab = () => {
  cy.visit("/admin/performance");
  cy.findByRole("tablist")
    .get("[aria-selected]")
    .contains("Database caching")
    .should("be.visible");
  cy.findByRole("tab", { name: "Dashboard and question caching" }).click();
};
