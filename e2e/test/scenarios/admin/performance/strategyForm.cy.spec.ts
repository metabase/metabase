const { H } = cy;
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  goToPerformancePage,
  interceptPerformanceRoutes,
} from "./helpers/e2e-performance-helpers";
import {
  adaptiveRadioButton,
  checkPreemptiveCachingDisabled,
  checkPreemptiveCachingEnabled,
  disablePreemptiveCaching,
  dontCacheResultsRadioButton,
  durationRadioButton,
  enablePreemptiveCaching,
  formLauncher,
  openSidebarCacheStrategyForm,
  openStrategyFormForDatabaseOrDefaultPolicy,
  preemptiveCachingSwitch,
  saveCacheStrategyForm,
  scheduleRadioButton,
} from "./helpers/e2e-strategy-form-helpers";

/** NOTE: These tests do not check whether caches are actually invalidated at the specified times. */
describe("scenarios > admin > performance > strategy form", () => {
  describe("oss", { tags: "@OSS" }, () => {
    beforeEach(() => {
      H.restore();
      interceptPerformanceRoutes();
      cy.signInAsAdmin();
      cy.visit("/admin");
      cy.findByRole("link", { name: "Performance" }).click();
    });

    it("can enable and disable model persistence", () => {
      goToPerformancePage("Model persistence");
      cy.findByRole("switch", { name: "Disabled" }).click({ force: true });
      cy.wait("@enablePersistence");
      cy.findByTestId("toast-undo").contains("Saved");
      cy.findByTestId("toast-undo")
        .findByRole("img", { name: /close icon/ })
        .click();

      cy.findByRole("switch", { name: "Enabled" }).click({ force: true });
      cy.wait("@disablePersistence");
      cy.findByTestId("toast-undo").contains("Saved");
    });

    it("can change when models are refreshed", () => {
      goToPerformancePage("Model persistence");
      cy.findByRole("switch", { name: "Disabled" }).click({ force: true });
      cy.wait("@enablePersistence");
      cy.findByTestId("toast-undo").contains("Saved");
      cy.findByTestId("toast-undo")
        .findByRole("img", { name: /close icon/ })
        .click();
      cy.findByRole("textbox").click();
      H.popover().findByText("2 hours").click();
      cy.findByTestId("toast-undo").contains("Saved");
    });

    it("can set default policy to Don't cache results", () => {
      cy.log("Set default policy to Adaptive first");
      adaptiveRadioButton().click();
      saveCacheStrategyForm({ strategyType: "ttl", model: "root" });
      adaptiveRadioButton().should("be.checked");

      cy.log("Then set default policy to Don't cache results");
      dontCacheResultsRadioButton().click();
      saveCacheStrategyForm({ strategyType: "nocache", model: "root" });
      dontCacheResultsRadioButton().should("be.checked");
    });

    it("has the correct nav items", () => {
      cy.findByTestId("admin-layout-sidebar").within(() => {
        cy.findAllByRole("link").should("have.length", 2);
        cy.findByText("Database caching").should("be.visible");
        cy.findByText("Model persistence").should("be.visible");
        cy.findByText("Dashboard and question caching").should("not.exist");
      });
    });

    // Configure-both / input-binding coverage lives in
    // frontend/.../StrategyEditorForDatabases.unit.spec.tsx ("lets user change
    // the default policy to 'Adaptive', then 'No caching'").
    it("can set default policy to adaptive", () => {
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

    it("has the correct nav items", () => {
      cy.visit("/admin");
      cy.findByRole("link", { name: "Performance" }).click();
      cy.findByTestId("admin-layout-sidebar").within(() => {
        cy.findAllByRole("link").should("have.length", 3);
        cy.findByText("Database caching").should("be.visible");
        cy.findByText("Dashboard and question caching").should("be.visible");
        cy.findByText("Model persistence").should("be.visible");
      });
    });

    it("can call cache invalidation endpoint for Sample Database", () => {
      openStrategyFormForDatabaseOrDefaultPolicy(
        "default policy",
        "No caching",
      );
      cy.log('A "Clear cache" button is not present for the default policy');
      cy.button(/Clear cache/).should("not.exist");

      openStrategyFormForDatabaseOrDefaultPolicy(
        "Sample Database",
        "No caching",
      );
      cy.log(
        'A "Clear cache" button is not yet present because the database does not use a cache',
      );
      cy.button(/Clear cache/).should("not.exist");

      cy.log("Set Sample Database's caching policy to Duration");
      durationRadioButton().click();

      cy.log("Save the caching strategy form");
      saveCacheStrategyForm({ strategyType: "duration", model: "database" });

      cy.log("Now there's a 'Clear cache' button. Click it");
      cy.button(/Clear cache for this database/).click();

      cy.log('Confirm via the "Clear cache" dialog');
      cy.findByRole("dialog")
        .button(/Clear cache/)
        .click();

      cy.wait("@invalidateCacheForSampleDatabase");

      cy.log("The cache has been cleared");
      cy.button(/Cache cleared/);
    });

    const checkInheritanceIfNeeded = (
      itemName: string,
      strategyName: string,
    ) => {
      if (itemName === "default policy") {
        cy.log(
          `Sample Database is now inheriting a default policy of ${strategyName}`,
        );
        formLauncher(
          "Sample Database",
          "currently inheriting the default policy",
          strategyName,
        );
      }
    };

    ["default policy", "Sample Database"].forEach((itemName) => {
      const model = itemName === "default policy" ? "root" : "database";

      it(`can set ${itemName} to Don't cache results`, () => {
        openStrategyFormForDatabaseOrDefaultPolicy(itemName, "No caching");
        cy.log(`Set ${itemName} to Duration first`);
        durationRadioButton().click();
        saveCacheStrategyForm({ strategyType: "duration", model });
        formLauncher(itemName, "currently", "Duration");

        cy.log(`Then set ${itemName} to Don't cache results`);
        dontCacheResultsRadioButton().click();
        saveCacheStrategyForm({ strategyType: "nocache", model });
        formLauncher(itemName, "currently", "No caching");
        checkInheritanceIfNeeded(itemName, "No caching");
      });

      it(`can set ${itemName} to a duration-based cache invalidation policy`, () => {
        openStrategyFormForDatabaseOrDefaultPolicy(itemName, "No caching");
        cy.log(`Set ${itemName} to Duration`);
        durationRadioButton().click();
        saveCacheStrategyForm({ strategyType: "duration", model });
        cy.log(`${itemName} is now set to Duration`);
        formLauncher(itemName, "currently", "Duration");
        checkInheritanceIfNeeded(itemName, "Duration");
      });

      // Min-duration / multiplier input binding is covered by the EE Jest
      // spec at enterprise/.../StrategyEditorForDatabases.unit.spec.tsx
      // ("lets user change the default policy from 'Duration' to 'Adaptive'
      // to 'Don't cache results'"). What survives here is the
      // save -> launcher-label round-trip plus the inheritance check for
      // default policy.
      it(`can set ${itemName} to adaptive`, () => {
        openStrategyFormForDatabaseOrDefaultPolicy(itemName, "No caching");
        adaptiveRadioButton().click();
        saveCacheStrategyForm({ strategyType: "ttl", model });
        formLauncher(itemName, "currently", "Adaptive");
        checkInheritanceIfNeeded(itemName, "Adaptive");
      });

      // Frequency-specific cron generation is exhaustively covered in
      // frontend/.../Schedule/Schedule.unit.spec.tsx (write-path) and
      // cron.unit.spec.ts (transform). The strategy-to-launcher-label
      // mapping is covered in the EE StrategyEditorForDatabases.unit.spec.tsx
      // ("can abbreviate a 'Schedule' strategy"). What survives here is the
      // save -> backend -> GET -> launcher re-render round-trip — one
      // representative schedule (weekly Tuesday 2 PM) is enough.
      it(`can save a schedule-based policy for ${itemName}`, () => {
        cy.visit("/admin");
        cy.findByRole("link", { name: "Performance" }).click();
        formLauncher(
          itemName,
          itemName === "default policy"
            ? "currently"
            : "currently inheriting the default policy",
          "No caching",
        ).click();
        scheduleRadioButton().click();

        cy.findByRole("textbox", { name: "Frequency" }).click();
        cy.findByRole("listbox").findByText("weekly").click();
        cy.findByRole("textbox", { name: "Day of the week" }).click();
        cy.findByRole("listbox").findByText("Tuesday").click();
        cy.findByRole("textbox", { name: "Time" }).click();
        cy.findByRole("listbox").findByText("2:00").click();
        cy.findByRole("radio", { name: "PM" }).click();

        saveCacheStrategyForm({ strategyType: "schedule", model });
        formLauncher(itemName, "currently", "Scheduled: weekly");
      });
    });

    describe("Dashboard and question caching tab", () => {
      it("can configure Sample Database on the 'Dashboard and question caching' tab", () => {
        interceptPerformanceRoutes();
        cy.visit("/admin/performance/dashboards-and-questions");
        cy.findByTestId("cache-config-table")
          .should("be.visible")
          .contains(
            "No dashboards or questions have their own caching policies yet.",
          );
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        durationRadioButton().click();
        cy.findByLabelText(/Cache results for this many hours/).type("99");
        saveCacheStrategyForm({ strategyType: "duration", model: "database" });
        cy.visit("/admin/performance/dashboards-and-questions");
        cy.findByTestId("cache-config-table")
          .contains("Duration: 99h")
          .within(() => {
            cy.findByText("Duration: 99h").click();
          });
        adaptiveRadioButton().click();
        saveCacheStrategyForm({ strategyType: "ttl", model: "database" });
      });

      it("confirmation modal appears before dirty form is abandoned", () => {
        interceptPerformanceRoutes();
        cy.visit("/admin/performance/dashboards-and-questions");
        cy.findByTestId("cache-config-table")
          .should("be.visible")
          .contains(
            "No dashboards or questions have their own caching policies yet.",
          );
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        durationRadioButton().click();
        cy.findByLabelText(/Cache results for this many hours/).type("99");
        saveCacheStrategyForm({ strategyType: "duration", model: "database" });
        cy.visit("/admin/performance/dashboards-and-questions");
        cy.findByTestId("cache-config-table")
          .contains("Duration: 99h")
          .within(() => {
            cy.findByText("Duration: 99h").click();
          });
        adaptiveRadioButton().click();
        saveCacheStrategyForm({ strategyType: "ttl", model: "database" });

        H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        durationRadioButton().click();
        cy.findByLabelText(/Cache results for this many hours/).type("24");
        saveCacheStrategyForm({ strategyType: "duration", model: "database" });
        cy.visit("/admin/performance/dashboards-and-questions");
        cy.findByTestId("cache-config-table").contains("Adaptive");
        cy.findByTestId("cache-config-table")
          .contains("Duration: 24h")
          .within(() => {
            cy.findByText("Duration: 24h").click();
          });

        cy.log("Make form dirty");
        scheduleRadioButton().click();

        cy.log("Modal appears when the user tries to close the sidesheet");
        cy.findByTestId("modal-overlay").click();

        H.modal()
          .should("have.length", 2) // sidesheet and confirm modal are both modals
          .last()
          .findByText("Discard your changes?");
      });
    });

    describe("Preemptive caching", () => {
      it("Preemptive caching can be enabled and disabled for duration-based caches", () => {
        // Enable preemptive caching in question settings sidebar
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        durationRadioButton().click();
        enablePreemptiveCaching();
        saveCacheStrategyForm({ strategyType: "duration", model: "database" });
        cy.findByLabelText("When to get new results").click();
        checkPreemptiveCachingEnabled();

        // Check that it's also enabled on the "Dashboard and question caching" admin page
        cy.visit("/admin/performance/dashboards-and-questions");
        cy.findByTestId("cache-config-table")
          .contains("Duration: 24h")
          .within(() => {
            cy.findByText("Duration: 24h").click();
          });
        checkPreemptiveCachingEnabled();

        // Disable preemptive caching on the admin page
        disablePreemptiveCaching();
        saveCacheStrategyForm({ strategyType: "duration", model: "database" });
        checkPreemptiveCachingDisabled();

        // Check that it's also disabled in the question sidebar
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        checkPreemptiveCachingDisabled();
      });

      it("Preemptive caching can be enabled and disabled for schedule-based caches", () => {
        // Enable preemptive caching in question settings sidebar
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        scheduleRadioButton().click();
        enablePreemptiveCaching();
        saveCacheStrategyForm({ strategyType: "schedule", model: "database" });
        cy.findByLabelText("When to get new results").click();
        checkPreemptiveCachingEnabled();

        // Check that it's also enabled on the "Dashboard and question caching" admin page
        cy.visit("/admin/performance/dashboards-and-questions");
        cy.findByTestId("cache-config-table")
          .contains("Scheduled: hourly")
          .within(() => {
            cy.findByText("Scheduled: hourly").click();
          });
        checkPreemptiveCachingEnabled();

        // Disable preemptive caching on the admin page
        disablePreemptiveCaching();
        saveCacheStrategyForm({ strategyType: "schedule", model: "database" });
        checkPreemptiveCachingDisabled();

        // Check that it's also disabled in the question sidebar
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        checkPreemptiveCachingDisabled();
      });

      // Database and root targets are covered by the Jest spec at
      // enterprise/.../caching/components/StrategyEditorForDatabases.unit.spec.tsx
      // ("does not show the preemptive caching switch for ...").
      it("Preemptive caching switch is not available for adaptive or no-caching strategies on a question", () => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        preemptiveCachingSwitch().should("not.exist");

        adaptiveRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");

        dontCacheResultsRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");
      });
    });
  });
});
