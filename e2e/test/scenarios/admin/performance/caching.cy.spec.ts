import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { interceptPerformanceRoutes } from "./helpers/e2e-performance-helpers";
import {
  adaptiveRadioButton,
  cacheStrategySidesheet,
  checkPreemptiveCachingDisabled,
  checkPreemptiveCachingEnabled,
  disablePreemptiveCaching,
  durationRadioButton,
  enablePreemptiveCaching,
  formLauncher,
  openSidebarCacheStrategyForm,
  openStrategyFormForDatabaseOrDefaultPolicy,
  saveCacheStrategyForm,
} from "./helpers/e2e-strategy-form-helpers";

const { H } = cy;

/**
 * Smoke tests for the caching feature.
 *
 * The bar for what lives here: the test must catch something neither
 * backend tests nor Jest component tests can. That means real HTTP
 * round-trips whose composition (frontend -> backend -> frontend) isn't
 * verifiable at either layer alone, cross-page flows that exercise
 * RTK-query cache invalidation across distinct UI surfaces, or
 * real-browser UX (modal portal stacking, ESC handling, history listeners).
 *
 * Coverage that lives elsewhere — and what's deliberately NOT here:
 *
 * - Strategy resolution / inheritance ladder, TTL behavior, schedule
 *   invalidation timing, refresh task: backend tests in
 *   metabase.query-processor.middleware.cache-test,
 *   metabase-enterprise.cache.{strategies,cache,config,task.refresh-cache-configs}-test.
 * - Cron transform and the Schedule UI -> cron mapping (28+ permutations),
 *   per-frequency conditional render, AM/PM 12-hour boundary,
 *   monthly-frame variants:
 *   frontend/.../Schedule/{cron,Schedule}.unit.spec.{ts,tsx}.
 * - Strategy form input binding (typing into Min Duration / Multiplier),
 *   strategy-switch flows (Adaptive <-> Duration <-> No caching),
 *   strategy -> launcher-label mapping, policy-options counts,
 *   preemptive caching switch availability for root/database targets:
 *   frontend/.../StrategyEditorForDatabases.unit.spec.tsx and
 *   enterprise/.../caching/components/StrategyEditorForDatabases.unit.spec.tsx.
 */
describe("scenarios > admin > performance > caching", () => {
  describe("oss", { tags: "@OSS" }, () => {
    beforeEach(() => {
      H.restore();
      interceptPerformanceRoutes();
      cy.signInAsAdmin();
    });

    it("saves the default-policy strategy and reflects the saved state", () => {
      cy.visit("/admin/performance");
      adaptiveRadioButton().click();
      saveCacheStrategyForm({ strategyType: "ttl", model: "root" });
      adaptiveRadioButton().should("be.checked");
    });
  });

  describe("ee", () => {
    beforeEach(() => {
      H.restore();
      interceptPerformanceRoutes();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("can configure a database cache strategy, save, and clear the cache", () => {
      openStrategyFormForDatabaseOrDefaultPolicy(
        "Sample Database",
        "No caching",
      );
      cy.log("Clear-cache button is absent before the database has a cache");
      cy.button(/Clear cache/).should("not.exist");

      cy.log("Set Sample Database to Duration and save");
      durationRadioButton().click();
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });
      formLauncher("Sample Database", "currently", "Duration");

      cy.log("Clear-cache button is now visible — click it");
      cy.button(/Clear cache for this database/).click();

      cy.log("Confirm in the dialog");
      cy.findByRole("dialog")
        .button(/Clear cache/)
        .click();
      cy.wait("@invalidateCacheForSampleDatabase");

      cy.button(/Cache cleared/).should("exist");
    });

    it("preemptive caching toggles persist across the question sidebar and the admin tab", () => {
      cy.log("Enable preemptive caching from the question sidebar");
      H.visitQuestion(ORDERS_QUESTION_ID);
      openSidebarCacheStrategyForm("question");
      durationRadioButton().click();
      enablePreemptiveCaching();
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });
      cy.findByLabelText("When to get new results").click();
      checkPreemptiveCachingEnabled();

      cy.log(
        "Toggle is reflected on the admin Dashboard and question caching tab",
      );
      cy.visit("/admin/performance/dashboards-and-questions");
      cy.findByTestId("cache-config-table").contains("Duration: 24h").click();
      checkPreemptiveCachingEnabled();

      cy.log("Disable from the admin tab");
      disablePreemptiveCaching();
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });
      checkPreemptiveCachingDisabled();

      cy.log("Toggle is reflected back in the question sidebar");
      H.visitQuestion(ORDERS_QUESTION_ID);
      openSidebarCacheStrategyForm("question");
      checkPreemptiveCachingDisabled();
    });

    /**
     * The dirty-form modal guards four independent close paths, each backed
     * by a different listener (Mantine close button, keyboard ESC handler,
     * outside-click detector, react-router history listener). This test
     * exercises all four against the question sidebar's cache strategy form.
     */
    it("guards closing a dirty cache form across all four close paths", () => {
      cy.log("Populate browser history so cy.go('back') has somewhere to go");
      cy.visit("/");
      cy.findByTestId("main-navbar-root").findByText("Our analytics").click();
      cy.findByTestId("collection-table").findByText("Orders").click();

      openSidebarCacheStrategyForm("question");
      cacheStrategySidesheet().within(() => {
        cy.findByText(/Caching settings/).should("be.visible");
        durationRadioButton().click();
      });

      cy.log("Action 1 — click the close (×) button");
      cacheStrategySidesheet().findByRole("button", { name: /Close/ }).click();
      cancelConfirmationModal();

      cy.log("Action 2 — press ESC");
      cy.get("body").type("{esc}");
      cancelConfirmationModal();

      cy.log("Action 3 — click outside (modal overlay)");
      cy.findAllByTestId("modal-overlay")
        .should("have.length.gte", 1)
        .last()
        .click();
      cancelConfirmationModal();

      cy.log("Action 4 — browser back button");
      cy.go("back");
      cancelConfirmationModal();
    });

    /**
     * When the admin tab has multiple cache-config rows, clicking each must
     * open the form initialized from that row's config — not a stale shared
     * state, not the first row regardless of which was clicked. The table
     * itself + per-row click handlers + form initialization from RTK-query
     * cache only line up correctly in the assembled app.
     */
    it("opens the right form when clicking distinct entries on the admin tab", () => {
      cy.log("Configure Orders with Duration: 99h");
      H.visitQuestion(ORDERS_QUESTION_ID);
      openSidebarCacheStrategyForm("question");
      durationRadioButton().click();
      cy.findByLabelText(/Cache results for this many hours/).type("99");
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });

      cy.log("Configure Orders, Count with Adaptive");
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openSidebarCacheStrategyForm("question");
      adaptiveRadioButton().click();
      saveCacheStrategyForm({ strategyType: "ttl", model: "database" });

      cy.log("Both entries are visible on the admin tab");
      cy.visit("/admin/performance/dashboards-and-questions");
      cy.findByTestId("cache-config-table")
        .should("contain", "Duration: 99h")
        .and("contain", "Adaptive");

      cy.log("Clicking Duration: 99h opens its form with duration selected");
      cy.findByTestId("cache-config-table").contains("Duration: 99h").click();
      durationRadioButton().should("be.checked");
      cy.findByLabelText(/Cache results for this many hours/).should(
        "have.value",
        "99",
      );

      cy.log("Close the sidesheet via ESC");
      cy.get("body").type("{esc}");

      cy.log("Clicking Adaptive opens its form with adaptive selected");
      cy.findByTestId("cache-config-table").contains("Adaptive").click();
      adaptiveRadioButton().should("be.checked");
    });
  });
});

const cancelConfirmationModal = () =>
  cy
    .findByTestId("confirm-modal")
    .should("be.visible")
    .button("Cancel")
    .click();
