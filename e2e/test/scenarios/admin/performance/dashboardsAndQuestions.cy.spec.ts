import { describeEE } from "e2e/support/helpers";

import {
  sampleDashboard,
  questionRuntime,
  sampleAdaptiveStrategy,
  sampleDatabase,
  sampleDurationStrategy,
  sampleQuestion,
  instanceDefault,
} from "./helpers/constants";
import {
  log,
  reloadUntil,
  resultIsCached,
  setupCachingTests,
  getCacheDuration,
  resetServerTime,
  getMillisecondsUntilCacheShouldBeInvalidated,
  setupDashboardTest,
  setupQuestionTest,
  humanizeDuration,
} from "./helpers/e2e-performance-helpers";
import {
  disableCaching,
  selectCacheStrategy,
} from "./helpers/e2e-strategy-form-helpers";
import type { CacheTestParameters } from "./helpers/types";

const itFunction = it;

/**
 * These tests check that dashboards and questions can use different cache invalidation strategies.
 *
 * Each test applies a certain cache invalidation strategy to a certain item - a question or
 * dashboard. The strategy is either applied directly, or the item is made to inherit the
 * strategy, either from the underlying database or from the global default policy.
 *
 * Since all the tests are similar, we can think of this as the same test
 * run repeatedly with different parameters. */
describeEE(
  "Cache invalidation for dashboards and questions",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      setupCachingTests();
    });
    afterEach(() => {
      resetServerTime();
    });

    describe("adaptive and duration strategies", () => {
      /** Each item in this array contains parameters for a test.
       *
       * You can add "it: it.only" or "it: it.skip" to control which tests run
       */
      (
        [
          {
            description: "questions can use adaptive strategy",
            strategy: sampleAdaptiveStrategy,
            item: sampleQuestion,
          },
          {
            description:
              "questions can inherit adaptive strategy from database",
            strategy: sampleAdaptiveStrategy,
            item: sampleQuestion,
            inheritsStrategyFrom: sampleDatabase,
          },
          {
            description:
              "questions can inherit adaptive strategy from instance-wide default policy",
            strategy: sampleAdaptiveStrategy,
            item: sampleQuestion,
            inheritsStrategyFrom: instanceDefault,
          },
          {
            description: "questions can use duration strategy",
            strategy: sampleDurationStrategy,
            item: sampleQuestion,
          },
          {
            description:
              "questions can inherit duration strategy from database",
            strategy: sampleDurationStrategy,
            item: sampleQuestion,
            inheritsStrategyFrom: sampleDatabase,
          },
          {
            description:
              "questions can inherit duration strategy from instance-wide default policy",
            strategy: sampleDurationStrategy,
            item: sampleQuestion,
            inheritsStrategyFrom: instanceDefault,
          },
          {
            description: "dashboards can use adaptive strategy",
            strategy: sampleAdaptiveStrategy,
            item: sampleDashboard,
          },
          {
            description:
              "dashboards can inherit adaptive strategy from database",
            strategy: sampleAdaptiveStrategy,
            item: sampleDashboard,
            inheritsStrategyFrom: sampleDatabase,
          },
          {
            description:
              "dashboards can inherit adaptive strategy from instance-wide default policy",
            strategy: sampleAdaptiveStrategy,
            item: sampleDashboard,
            inheritsStrategyFrom: instanceDefault,
          },
          {
            description: "dashboards can use duration strategy",
            strategy: sampleDurationStrategy,
            item: sampleDashboard,
          },
          {
            description:
              "dashboards can inherit duration strategy from database",
            strategy: sampleDurationStrategy,
            item: sampleDashboard,
            inheritsStrategyFrom: sampleDatabase,
          },
          {
            description:
              "dashboards can inherit duration strategy from instance-wide default policy",
            strategy: sampleDurationStrategy,
            item: sampleDashboard,
            inheritsStrategyFrom: instanceDefault,
          },
        ] as CacheTestParameters[]
      ).forEach(
        ({
          strategy,
          item,
          inheritsStrategyFrom,
          description,
          it = itFunction,
        }) => {
          it(description, () => {
            const { reload, visitItem } =
              item.model === "question"
                ? setupQuestionTest(sampleQuestion)
                : setupDashboardTest(sampleDashboard, sampleQuestion);

            const itemToConfigure = inheritsStrategyFrom ?? item;

            cy.then(function () {
              selectCacheStrategy({
                item: itemToConfigure,
                strategy,
              });

              visitItem();
            });

            cy.then(function () {
              reloadUntil(resultIsCached, {
                logMessage: "Reloading until the result is cached",
                wrapFinalResultAs: "cachedResult",
                wrapTimeOfFinalResultAs: "firstCachedResultSeenAt",
                reload,
              });
            });

            const expectedCacheDuration =
              getMillisecondsUntilCacheShouldBeInvalidated(strategy);
            cy.then(function () {
              getCacheDuration({
                cacheStartTime: this.firstCachedResultSeenAt,
                expectedCacheDuration,
                reload,
                questionRuntime,
              }).as("cacheDuration");
            });

            cy.then(function () {
              expect(this.freshResult.length).to.eq(32);
              expect(this.cachedResult.length).to.eq(32);
              expect(this.freshResult).to.not.eq(this.cachedResult);
              expect(
                this.cacheDuration,
                `Cache should last ${humanizeDuration(expectedCacheDuration)}`,
              ).to.be.approximately(expectedCacheDuration, 2500);
            });
          });
        },
      );
    });

    /** Test that when a question is in a dashboard and both the dashboard and the question have a strategy,
     * the question is cached according to the dashboard's strategy, not the question's strategy
     *
     * Note: The shortest possible adaptive strategy invalidates the cache after just a few seconds,
     * but the shortest possible duration strategy invalidates the cache after an hour,
     * so it's easier to tell when an adaptive strategy has overridden a duration strategy -
     * you can just check that cache is invalidated after a few seconds.
     */
    it("dashboard's adaptive strategy can override question's duration strategy", () => {
      const { reload: reloadDashboard, visitItem: visitDashboard } =
        setupDashboardTest(sampleDashboard, sampleQuestion);

      cy.then(function () {
        selectCacheStrategy({
          item: sampleQuestion,
          strategy: sampleDurationStrategy,
        });
        selectCacheStrategy({
          item: sampleDashboard,
          strategy: sampleAdaptiveStrategy,
        });
      });

      cy.then(function () {
        visitDashboard();
        reloadUntil(resultIsCached, {
          logMessage: "Reloading until the result is cached",
          wrapFinalResultAs: "cachedResult",
          wrapTimeOfFinalResultAs: "firstCachedResultSeenAt",
          reload: reloadDashboard,
        });
      });

      const expectedCacheDuration =
        getMillisecondsUntilCacheShouldBeInvalidated(sampleAdaptiveStrategy);
      cy.then(function () {
        getCacheDuration({
          cacheStartTime: this.firstCachedResultSeenAt,
          expectedCacheDuration,
          reload: reloadDashboard,
          questionRuntime,
        }).as("cacheDuration");
      });

      cy.then(function () {
        expect(this.freshResult.length).to.eq(32);
        expect(this.cachedResult.length).to.eq(32);
        expect(this.freshResult).to.not.eq(this.cachedResult);
        expect(
          this.cacheDuration,
          `Cache should last ${humanizeDuration(
            expectedCacheDuration,
          )}, following the dashboard's strategy, not the question's strategy`,
        ).to.be.approximately(expectedCacheDuration, 2500);
      });
    });

    describe("no-caching policy", () => {
      (
        [
          {
            description: "questions can use no-caching policy",
            item: sampleQuestion,
          },
          {
            description:
              "questions can inherit no-caching policy from database",
            item: sampleQuestion,
            inheritsStrategyFrom: sampleDatabase,
          },
          {
            description:
              "questions can inherit no-caching policy from instance-wide default policy",
            item: sampleQuestion,
            inheritsStrategyFrom: instanceDefault,
          },
          {
            description: "dashboards can use no-caching policy",
            item: sampleDashboard,
          },
          {
            description:
              "dashboards can inherit no-caching policy from database",
            item: sampleDashboard,
            inheritsStrategyFrom: sampleDatabase,
          },
          {
            description:
              "dashboards can inherit no-caching policy from instance-wide default policy",
            item: sampleDashboard,
            inheritsStrategyFrom: instanceDefault,
          },
        ] as CacheTestParameters[]
      ).forEach(
        ({ description, item, inheritsStrategyFrom, it = itFunction }) => {
          it(description, () => {
            const { reload, visitItem } =
              item.model === "question"
                ? setupQuestionTest(sampleQuestion)
                : setupDashboardTest(sampleDashboard, sampleQuestion);
            visitItem();

            // Don't try to disable caching on the root since it's disabled by default
            const shouldDisableCaching = inheritsStrategyFrom?.model !== "root";

            if (shouldDisableCaching) {
              cy.then(function () {
                disableCaching({ item: inheritsStrategyFrom ?? item });
                visitItem();
                reload();
              });
            }

            cy.then(function () {
              log("Expect the last query to be slow");
              expect(this.queryRuntime).to.be.approximately(
                questionRuntime,
                250,
              );
            });
          });
        },
      );
    });
  },
);
