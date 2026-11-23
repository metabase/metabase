import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const preemptiveCachingSwitch = () =>
  cy.findByTestId("preemptive-caching-switch");

const saveCacheStrategyForm = () => {
  cy.intercept("PUT", "/api/cache").as("putCacheConfig");
  cy.findByRole("form", { name: "Cache invalidation policy" })
    .button(/Save/)
    .click();
  cy.wait("@putCacheConfig");
};

const openSidebarCacheStrategyForm = (type: "question" | "dashboard") => {
  cy.intercept("GET", "/api/cache?model=*&id=*").as("getCacheConfig");
  if (type === "dashboard") {
    H.openDashboardSettingsSidebar();
  } else {
    H.openQuestionActions("Edit settings");
  }
  cy.wait("@getCacheConfig");
  cy.findByLabelText("When to get new results").click();
  return H.cacheStrategySidesheet();
};

/**
 * Smoke tests for the caching feature.
 *
 * The bar for what lives here: the test must catch something neither
 * backend tests nor Jest component tests can. That means real HTTP
 * round-trips whose composition (frontend -> backend -> frontend) isn't
 * verifiable at either layer alone, or cross-page flows that exercise
 * RTK-query cache invalidation across distinct UI surfaces.
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
 *   strategy -> row-label mapping, policy-options counts,
 *   preemptive caching switch availability for root/database targets,
 *   OSS default-policy save, clear-cache button availability:
 *   frontend/.../StrategyEditorForDatabases.unit.spec.tsx and
 *   enterprise/.../caching/components/StrategyEditorForDatabases.unit.spec.tsx.
 * - Opening the form of the clicked row on the admin tab:
 *   enterprise/.../StrategyEditorForQuestionsAndDashboards.unit.spec.tsx.
 * - The dirty-form guard on the close button, Escape, overlay click and
 *   browser back: query_builder/.../QuestionSettingsSidebar/tests/
 *   enterprise.unit.spec.tsx and enterprise/.../SidebarCacheForm.unit.spec.tsx.
 */
describe("scenarios > admin > performance > caching", () => {
  describe("ee", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("can configure a database cache strategy, save, and clear the cache", () => {
      cy.visit("/admin/performance");
      cy.findByTestId("admin-layout-content")
        .findByLabelText(/Edit.*Sample Database.*currently.*No caching/)
        .click();

      cy.log("Set Sample Database to Duration and save");
      H.selectCacheStrategy(/Duration/);
      H.fillCacheDuration(24);
      saveCacheStrategyForm();
      cy.findByTestId("admin-layout-content").findByLabelText(
        /Edit.*Sample Database.*currently.*Duration/,
      );

      cy.intercept(
        "POST",
        "/api/cache/invalidate?include=overrides&database=*",
      ).as("invalidateCacheForSampleDatabase");

      cy.log("Clear-cache button is now visible — click it");
      cy.button(/Clear cache for this database/).click();

      cy.log("Confirm in the dialog");
      cy.findByTestId("confirm-modal")
        .button(/Clear cache/)
        .click();
      cy.wait("@invalidateCacheForSampleDatabase");

      cy.button(/Cache cleared/).should("exist");
    });

    it("preemptive caching toggles persist across the question sidebar and the admin tab", () => {
      cy.log("Enable preemptive caching from the question sidebar");
      H.visitQuestion(ORDERS_QUESTION_ID);
      openSidebarCacheStrategyForm("question");
      H.selectCacheStrategy(/Duration/);
      // 24 keeps the "Duration: 24h" admin-tab assertion below true
      H.fillCacheDuration(24);
      preemptiveCachingSwitch().within(() => {
        cy.findByRole("switch").should("not.be.checked");
        cy.findByRole("switch").parent("label").click();
        cy.findByRole("switch").should("be.checked");
      });

      cy.log("Escape asks before discarding the unsaved edits");
      // Jest renders the question settings sidebar without the query builder
      // that unmounts it on close, so only here does closing the parent
      // sheet on Escape lose the edits
      cy.get("body").type("{esc}");
      cy.findByTestId("confirm-modal")
        .should("be.visible")
        .button("Cancel")
        .click();
      preemptiveCachingSwitch().findByRole("switch").should("be.checked");

      // After saving, the form reloads its config; wait for that reload before
      // re-opening so the assertion doesn't race a stale (pre-save) render.
      cy.intercept("GET", "/api/cache?model=*&id=*").as("reloadCacheConfig");
      saveCacheStrategyForm();
      cy.wait("@reloadCacheConfig");
      cy.findByLabelText("When to get new results").click();
      preemptiveCachingSwitch().findByRole("switch").should("be.checked");

      cy.log(
        "Toggle is reflected on the admin Dashboard and question caching tab",
      );
      cy.visit("/admin/performance/dashboards-and-questions");
      cy.findByTestId("cache-config-table").contains("Duration: 24h").click();
      preemptiveCachingSwitch().findByRole("switch").should("be.checked");

      cy.log("Disable from the admin tab");
      preemptiveCachingSwitch().within(() => {
        cy.findByRole("switch").should("be.checked");
        cy.findByRole("switch").parent("label").click();
        cy.findByRole("switch").should("not.be.checked");
      });
      saveCacheStrategyForm();
      preemptiveCachingSwitch().findByRole("switch").should("not.be.checked");

      cy.log("Toggle is reflected back in the question sidebar");
      H.visitQuestion(ORDERS_QUESTION_ID);
      openSidebarCacheStrategyForm("question");
      preemptiveCachingSwitch().findByRole("switch").should("not.be.checked");
    });
  });
});
