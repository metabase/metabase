import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { NativeQuestionDetails } from "e2e/support/helpers";
import {
  createNativeQuestion,
  modal,
  visitDashboard,
  visitQuestion,
} from "e2e/support/helpers";
import type { CacheStrategy } from "metabase-types/api";

import { questionRuntime } from "./constants";
import type { DashboardDetails } from "./types";

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

export const setupQuestionTest = (
  nativeQuestionDetails: NativeQuestionDetails,
) => {
  log(`Create a question that takes ${questionRuntime} milliseconds to run`);
  createNativeQuestion(nativeQuestionDetails, {
    visitQuestion: true,
    wrapId: true,
  });
  const visitItem = () =>
    cy.then(function () {
      log("Visiting the question");
      visitQuestion("@questionId");
    });
  return { visitItem };
};

export const setupDashboardTest = (
  dashboardDetails: DashboardDetails,
  questionDetails: NativeQuestionDetails,
) => {
  createNativeQuestionInDashboard({
    questionDetails,
    dashboardDetails,
    visitDashboard: true,
  });

  const waitForQuery = () => cy.wait("@dashcardQuery");
  const visitItem = () =>
    cy.then(function () {
      visitDashboard(this.dashboardId);
    });
  return { visitItem, waitForQuery };
};

export const saveQuestion = ({ withName }: { withName: string }) => {
  log("Save the question");
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByTestId("qb-header").button(/^Save/).click();
  cy.findByLabelText("Name").type(withName);
  modal().button("Save").click();
  cy.findByText("Not now").click();
  cy.wait("@saveQuestion");
};

export const getDetailsForQuestionWithFixedRuntime = ({
  runtime,
}: {
  /** Runtime in milliseconds */
  runtime: number;
}) => ({
  name: "Question with fixed runtime",
  database: WRITABLE_DB_ID,
  native: {
    query: `select (MD5(random()::text)), pg_sleep(${runtime / 1000})`,
  },
});

export const createNativeQuestionInDashboard = ({
  questionDetails,
  dashboardDetails,
  visitDashboard: shouldVisitDashboard = true,
}: {
  questionDetails: NativeQuestionDetails;
  dashboardDetails: DashboardDetails;
  visitDashboard: boolean;
}) =>
  (cy as any)
    .createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    })
    .then(({ body }: { body: { dashboard_id: number } }) => {
      const { dashboard_id } = body;
      cy.wrap(dashboard_id).as("dashboardId");
      if (shouldVisitDashboard) {
        visitDashboard(dashboard_id);
      }
    });

/** Sets the server clock, which then stops advancing automatically */
export const freezeServerTime = ({
  addMilliseconds,
  time,
  wrapServerTimeAs,
}: {
  addMilliseconds?: number;
  time?: string;
  wrapServerTimeAs?: string;
}) =>
  cy
    .request("POST", "/api/testing/set-time", {
      "add-ms": addMilliseconds,
      time,
    })
    .then(response => {
      if (wrapServerTimeAs) {
        cy.wrap(response.body.time).as(wrapServerTimeAs);
      }
    });

export const resetServerTime = () => freezeServerTime({});

/** Get the number of milliseconds until the moment when the cache should
 * expire */
export const getExpectedCacheDuration = (strategy: CacheStrategy) => {
  if (strategy.type === "ttl") {
    return strategy.multiplier * questionRuntime;
  }

  if (strategy.type === "duration") {
    return strategy.duration * 60 * 60 * 1000;
  }

  if (strategy.type === "schedule") {
    return millisecondsUntilEndOfHour();
  }

  throw new Error(`Unsupported strategy type: ${strategy.type}`);
};

export const millisecondsUntilEndOfHour = () => {
  const now = new Date();
  const nextHour = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours() + 1,
    0,
    0,
    0,
  );
  return nextHour.getTime() - now.getTime();
};

export const advanceServerClockBy = (milliseconds: number) => {
  log(`Advancing clock by ${milliseconds}ms`);
  return cy.request("POST", "/api/testing/set-time", {
    "add-ms": milliseconds,
  });
};
