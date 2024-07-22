import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";

import {
  createNativeQuestion,
  modal,
  restore,
  setTokenFeatures,
  visitDashboard,
  visitQuestion,
} from "e2e/support/helpers";
import type { NativeQuestionDetails } from "e2e/support/helpers/e2e-question-helpers";
import type { CacheStrategy, CacheableModel } from "metabase-types/api";

import { questionRuntime } from "./constants";
import type { DashboardDetails } from "./types";
dayjs.extend(duration);
dayjs.extend(relativeTime);

export const setupCachingTests = () => {
  interceptRoutes();
  restore("postgres-12");
  cy.signInAsAdmin();
  setTokenFeatures("all");
  // Enable query caching because the BE still checks this setting
  cy.request("PUT", "/api/setting/enable-query-caching", { value: true });
};

export const setupQuestionTest = (
  nativeQuestionDetails: NativeQuestionDetails,
) => {
  log(`Create a question that takes ${questionRuntime} milliseconds to run`);
  createNativeQuestion(nativeQuestionDetails, {
    visitQuestion: true,
    wrapId: true,
  });
  const reload = reloadQuestion;
  const visitItem = () =>
    cy.then(function () {
      log("Visiting the question");
      visitQuestion("@questionId");
    });
  return { reload, visitItem };
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
  const reload = reloadDashboard;
  const waitForQuery = () => cy.wait("@dashcardQuery65");
  const visitItem = () =>
    cy.then(function () {
      visitDashboard(this.dashboardId);
    });
  return { reload, visitItem, waitForQuery };
};

/** Intercept routes for caching tests */
export const interceptRoutes = () => {
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
};

/** Cypress log messages sometimes occur out of order so it is helpful to log to the console as well. */
export const log = (message: string) => {
  cy.log(message);
  console.log(message);
};

export const reloadItem = ({
  /** 'Model' in the sense of 'type of thing' */
  model,
  endpointAlias,
}: {
  model: CacheableModel;
  endpointAlias: string;
}) => {
  log(`Reload ${model}`);
  cy.reload();
  return cy.wait(endpointAlias).then(interception => {
    cy.wrap(interception.response?.body.running_time).as("queryRuntime");
  });
};

export const reloadQuestion = () =>
  reloadItem({ model: "question", endpointAlias: "@cardQuery" });
export const reloadDashboard = () =>
  reloadItem({ model: "dashboard", endpointAlias: "@dashcardQuery65" });

export const resultIsCached = (previousResult: string, nextResult: string) =>
  previousResult === nextResult;
export const resultIsFresh = (previousResult: string, nextResult: string) =>
  previousResult !== nextResult;

/** The caching tests load a question (sometimes inside a dashboard) which has just one result: an MD5 string. This function finds that string and wraps it. */
export const wrapResult = () =>
  cy.url().then(url => {
    const timeout = questionRuntime * 3;
    const cell = url.includes("dashboard")
      ? cy.findAllByTestId("cell-data", { timeout }).first()
      : cy
          .get("#main-data-grid", { timeout })
          .findAllByTestId("cell-data")
          .first();
    cell.invoke("text").then(result => {
      expect(
        result.length,
        "The result, ${result}, has the correct length",
      ).to.eq(32);
      return cy.wrap(result);
    });
  });

/** Reload the page until a certain condition is met */
export const reloadUntil = (
  condition: (previousResult: string, nextResult: string) => boolean,
  options: {
    logMessage: string;
    /** How many times we should try before giving up */
    tries?: number;
    wrapFinalResultAs: string;
    wrapTimeOfFinalResultAs?: string;
    /** Function that reloads the page */
    reload: () => void;
    letClockAdvance?: () => void;
  },
) => {
  const {
    logMessage,
    tries = 20,
    wrapFinalResultAs,
    wrapTimeOfFinalResultAs,
    letClockAdvance = () => cy.wait(1000),
    reload,
  } = options;
  log(logMessage);
  if (tries === 0) {
    throw new Error("The expected condition was never met.");
  }
  letClockAdvance();
  wrapResult().as("previousResult");
  reload();
  wrapResult().as("nextResult");
  cy.then(function () {
    const done = condition(this.previousResult, this.nextResult);
    if (done) {
      log(
        `The condition has been met. Saving ${this.nextResult} as ${wrapFinalResultAs}`,
      );
      cy.wrap(this.nextResult).as(wrapFinalResultAs);
      if (wrapTimeOfFinalResultAs) {
        cy.wrap(new Date().getTime()).as(wrapTimeOfFinalResultAs);
      }
    } else {
      reloadUntil(condition, {
        ...options,
        tries: tries - 1,
      });
    }
  });
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
  database: 2, // This is the "QA Postgres12" database
  native: {
    query: `select (MD5(random()::text)), pg_sleep(${runtime / 1000})`,
  },
});

export const databaseCachingSettingsPage = () =>
  cy.findByRole("main", { name: "Database caching settings" });

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

/**
 * Figure out how long the cache lasted for. To test a long cache duration like
 * 1 week, rather than make Cypress wait a whole week, we move the
 * server's clock forward by 1 week minus a few seconds, then reload the page
 * until the cache is invalidated.
 *
 * Once the server clock has been manually set, its clock remains frozen,
 * so we must move the server clock forward manually.
 *
 * When this function finds an uncached result (which shows that the cache
 * was invalidated), it wraps this as "freshResult".
 */
export const getCacheDuration = ({
  cacheStartTime,
  expectedCacheDuration,
  reload,
  questionRuntime,
}: {
  /** The first moment of the cache's duration (in milliseconds since midnight, January 1, 1970 UTC). */
  cacheStartTime: number;
  /** In milliseconds */
  expectedCacheDuration: number;
  reload: () => void;
  /** The runtime of the question in milliseconds */
  questionRuntime: number;
}) => {
  /** We will move the server clock ahead by this many milliseconds */
  const clockAdjustment = expectedCacheDuration - 3000;

  // Advance clock until shortly before the cache is supposed to be cleared

  const advanceServerClockBy = (milliseconds: number) =>
    cy.request("POST", "/api/testing/set-time", {
      "add-ms": milliseconds,
    });

  log(`Advancing clock by ${clockAdjustment}ms`);
  advanceServerClockBy(clockAdjustment);

  // Wait for the /api/testing/set-time request to finish
  cy.wait(250);

  reloadUntil(resultIsFresh, {
    wrapFinalResultAs: "freshResult",
    logMessage: "Reloading until result is no longer cached",
    reload,
    // We move the server clock forward manually
    letClockAdvance: () => advanceServerClockBy(1000),
  });

  // Above, we reloaded the item until its result was no longer cached.
  // Retrieve both the cached result and the new, non-cached result.
  return cy.then(function () {
    const firstFreshResultSeenAt = new Date().getTime();

    // For example, if it took 4000ms (of real time) to find a fresh result
    // (which takes 2000ms to run), and we moved the server clock ahead
    // by 60000ms, then the cache duration would be:
    // 4000ms + 60000ms - 2000ms = 62000ms.
    const millisecondsBeforeSeeingFreshResult =
      firstFreshResultSeenAt - cacheStartTime;
    const cacheDuration =
      millisecondsBeforeSeeingFreshResult + clockAdjustment - questionRuntime;
    return cacheDuration;
  });
};

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

/** Get the number of milliseconds until the strategy's moment of cache invalidation */
export const getMillisecondsUntilCacheShouldBeInvalidated = (
  strategy: CacheStrategy,
) => {
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

export const humanizeDuration = (milliseconds: number) =>
  dayjs.duration(milliseconds).humanize();
