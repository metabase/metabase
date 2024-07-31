import { describeEE, restore, setTokenFeatures } from "e2e/support/helpers";

import {
  instanceDefault,
  questionRuntime,
  sampleAdaptiveStrategy,
  sampleDashboard,
  sampleDatabase,
  sampleDurationStrategy,
  sampleQuestion,
} from "./helpers/constants";
import {
  advanceServerClockBy,
  getExpectedCacheDuration,
  interceptRoutes,
  log,
  resetServerTime,
  setupDashboardTest,
  setupQuestionTest,
  wrapResult,
} from "./helpers/e2e-performance-helpers";
import {
  disableCaching,
  selectCacheStrategy,
} from "./helpers/e2e-strategy-form-helpers";
import type { CacheTestParameters } from "./helpers/types";

const itFunction = it;

const testCacheStrategy = ({
  strategy,
  item,
  inheritsStrategyFrom,
  description,
  it = itFunction,
}: CacheTestParameters) => {
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

    const expectedCacheDuration = getExpectedCacheDuration(strategy);

    advanceServerClockBy(expectedCacheDuration - 2000)
      .then(() => {
        reload();
        wrapResult().as("firstResultBeforeCacheShouldExpire");
      })
      .then(() => advanceServerClockBy(1000))
      .then(() => {
        reload();
        wrapResult().as("secondResultBeforeCacheShouldExpire");
      })
      .then(() => advanceServerClockBy(5000))
      .then(() => {
        reload();
        wrapResult().as("resultAfterCacheShouldExpire");
      });

    cy.then(function () {
      expect(this.firstResultBeforeCacheShouldExpire).to.eq(
        this.secondResultBeforeCacheShouldExpire,
      );
      expect(this.resultAfterCacheShouldExpire).to.not.eq(
        this.secondResultBeforeCacheShouldExpire,
      );
    });
  });
};

const testDoNotCachePolicy = ({
  description,
  item,
  inheritsStrategyFrom,
  it = itFunction,
}: CacheTestParameters) => {
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
      expect(this.queryRuntime).to.be.approximately(questionRuntime, 250);
    });
  });
};

/**
 * These tests check that dashboards and questions can use different cache invalidation strategies.
 *
 * Each test applies a certain cache invalidation strategy to a certain item - a question or
 * dashboard. The strategy is either applied directly, or the item is made to inherit the
 * strategy, either from the underlying database or from the global default policy.
 *
 * Since all the tests are similar, we can think of this as the same test
 * run repeatedly with different parameters. */
describe(
  "Cache invalidation for dashboards and questions",
  { tags: "@external" },
  () => {
    describeEE("ee", () => {
      beforeEach(() => {
        resetServerTime();
        interceptRoutes();
        restore("postgres-12");
        cy.signInAsAdmin();
        setTokenFeatures("all");
      });

      describe("adaptive and duration strategies", () => {
        /** Each item in this array contains parameters for a test.
         *
         * You can add "it: it.only" or "it: it.skip" to any of the objects below
         * to control which tests run
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
        ).forEach(testCacheStrategy);
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
        ).forEach(testDoNotCachePolicy);
      });
    });

    describe("oss", { tags: "@OSS" }, () => {
      beforeEach(() => {
        resetServerTime();
        interceptRoutes();
        restore("postgres-12");
        cy.signInAsAdmin();
      });

      (
        [
          {
            description:
              "questions can inherit adaptive strategy from instance-wide default policy",
            strategy: sampleAdaptiveStrategy,
            item: sampleQuestion,
            inheritsStrategyFrom: instanceDefault,
          },
          {
            description:
              "dashboards can inherit adaptive strategy from instance-wide default policy",
            strategy: sampleAdaptiveStrategy,
            item: sampleDashboard,
            inheritsStrategyFrom: instanceDefault,
          },
        ] as CacheTestParameters[]
      ).forEach(testCacheStrategy);
    });
  },
);
