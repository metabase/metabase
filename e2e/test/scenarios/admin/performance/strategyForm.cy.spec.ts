import { H } from "e2e/support";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  interceptPerformanceRoutes,
  visitDashboardAndQuestionCachingTab,
} from "./helpers/e2e-performance-helpers";
import {
  adaptiveRadioButton,
  cacheStrategyForm,
  cancelConfirmationModal,
  checkPreemptiveCachingDisabled,
  checkPreemptiveCachingEnabled,
  dashboardAndQuestionsTable,
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
      cy.findByRole("tab", { name: "Model persistence" }).click();
      cy.findByRole("checkbox", { name: "Disabled" }).next("label").click();
      cy.wait("@enablePersistence");
      cy.findByTestId("toast-undo").contains("Saved");
      cy.findByTestId("toast-undo")
        .findByRole("img", { name: /close icon/ })
        .click();

      cy.findByRole("checkbox", { name: "Enabled" }).next("label").click();
      cy.wait("@disablePersistence");
      cy.findByTestId("toast-undo").contains("Saved");
    });

    it("can change when models are refreshed", () => {
      cy.findByRole("tab", { name: "Model persistence" }).click();
      cy.findByRole("checkbox", { name: "Disabled" }).next("label").click();
      cy.wait("@enablePersistence");
      cy.findByTestId("toast-undo").contains("Saved");
      cy.findByTestId("toast-undo")
        .findByRole("img", { name: /close icon/ })
        .click();
      cy.findByRole("combobox").click();
      cy.findByRole("listbox").findByText("2 hours").click();
      cy.findByTestId("toast-undo").contains("Saved");
    });

    it("there are two policy options for the default policy, Adaptive and Don't cache results", () => {
      cacheStrategyForm().findAllByRole("radio").should("have.length", 2);
      adaptiveRadioButton().should("exist");
      dontCacheResultsRadioButton().should("exist");
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

    it("has the right tabs", () => {
      cy.findByRole("main")
        .findByRole("tablist")
        .findAllByRole("tab")
        .should("have.length", 2);
      cy.findByRole("tab", { name: "Database caching" }).should("be.visible");
      cy.findByRole("tab", { name: "Model persistence" }).should("be.visible");
      cy.findByRole("tab", { name: "Dashboard and question caching" }).should(
        "not.exist",
      );
    });

    describe("adaptive strategy", () => {
      it("can set default policy to adaptive", () => {
        adaptiveRadioButton().click();
        saveCacheStrategyForm({ strategyType: "ttl", model: "root" });
        adaptiveRadioButton().should("be.checked");
      });

      it("can configure both a minimum query duration and a multiplier for the default adaptive policy", () => {
        adaptiveRadioButton().click();
        cy.findByLabelText(/Minimum query duration/).type("1234");
        cy.findByLabelText(/Multiplier/).type("4");
        saveCacheStrategyForm({ strategyType: "ttl", model: "root" });
        adaptiveRadioButton().should("be.checked");
        cy.findByLabelText(/Minimum query duration/).should(
          "have.value",
          "1234",
        );
        cy.findByLabelText(/Multiplier/).should("have.value", "4");
      });
    });
  });

  H.describeEE("ee", () => {
    beforeEach(() => {
      H.restore();
      interceptPerformanceRoutes();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    it("has the right tabs", () => {
      cy.visit("/admin");
      cy.findByRole("link", { name: "Performance" }).click();
      cy.findByRole("main")
        .findByRole("tablist")
        .findAllByRole("tab")
        .should("have.length", 3);
      cy.findByRole("tab", { name: "Database caching" }).should("be.visible");
      cy.findByRole("tab", { name: "Dashboard and question caching" }).should(
        "be.visible",
      );
      cy.findByRole("tab", { name: "Model persistence" }).should("be.visible");
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

    ["default policy", "Sample Database"].forEach(itemName => {
      const model = itemName === "default policy" ? "root" : "database";
      const expectedNumberOfOptions = itemName === "default policy" ? 4 : 5;

      it(`there are ${expectedNumberOfOptions} policy options for ${itemName}`, () => {
        openStrategyFormForDatabaseOrDefaultPolicy(itemName, "No caching");
        cacheStrategyForm()
          .findAllByRole("radio")
          .should("have.length", expectedNumberOfOptions);
      });

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

      describe("adaptive strategy", () => {
        beforeEach(() => {
          openStrategyFormForDatabaseOrDefaultPolicy(itemName, "No caching");
          adaptiveRadioButton().click();
        });

        it(`can set ${itemName} to adaptive`, () => {
          saveCacheStrategyForm({ strategyType: "ttl", model });
          formLauncher(itemName, "currently", "Adaptive");
          checkInheritanceIfNeeded(itemName, "Adaptive");
        });

        it(`can configure a minimum query duration for ${itemName}'s adaptive policy`, () => {
          cy.findByLabelText(/Minimum query duration/).type("1000");
          saveCacheStrategyForm({ strategyType: "ttl", model });
          formLauncher(itemName, "currently", "Adaptive");
          cy.findByLabelText(/Minimum query duration/).should(
            "have.value",
            "1000",
          );
        });

        it(`can configure a multiplier for ${itemName}'s adaptive policy`, () => {
          cy.findByLabelText(/Multiplier/).type("3");
          saveCacheStrategyForm({ strategyType: "ttl", model });
          formLauncher(itemName, "currently", "Adaptive");
          cy.findByLabelText(/Multiplier/).should("have.value", "3");
        });

        it(`can configure both a minimum query duration and a multiplier for ${itemName}'s adaptive policy`, () => {
          cy.findByLabelText(/Minimum query duration/).type("1234");
          cy.findByLabelText(/Multiplier/).type("4");
          saveCacheStrategyForm({ strategyType: "ttl", model });
          formLauncher(itemName, "currently", "Adaptive");
          cy.findByLabelText(/Minimum query duration/).should(
            "have.value",
            "1234",
          );
          cy.findByLabelText(/Multiplier/).should("have.value", "4");
        });
      });

      describe(`can set ${itemName} to a schedule-based cache invalidation policy`, () => {
        beforeEach(() => {
          cy.visit("/admin");
          cy.findByRole("link", { name: "Performance" }).click();
          cy.log(`Open caching strategy form for ${itemName}`);
          formLauncher(
            itemName,
            itemName === "default policy"
              ? "currently"
              : "currently inheriting the default policy",
            "No caching",
          ).click();
          cy.log("View schedule options");
          scheduleRadioButton().click();
        });

        const selectScheduleType = (type: string) => {
          cy.log(`Set schedule to "${type}"`);
          cy.findByRole("searchbox").click();
          cy.findByRole("listbox").findByText(type).click();
        };

        it(`can save a new hourly schedule policy for ${itemName}`, () => {
          selectScheduleType("hourly");
          saveCacheStrategyForm({ strategyType: "schedule", model });
          formLauncher(itemName, "currently", "Scheduled: hourly");
        });

        it(`can save a new daily schedule policy - for ${itemName}`, () => {
          [12, 1, 11].forEach(time => {
            ["AM", "PM"].forEach(amPm => {
              cy.log(`Test daily at ${time} ${amPm}`);
              selectScheduleType("daily");
              cy.findAllByRole("searchbox").eq(1).click();
              cy.findByRole("listbox").findByText(`${time}:00`).click();
              cy.findByLabelText(amPm).next().click();
              saveCacheStrategyForm({ strategyType: "schedule", model });
              formLauncher("Sample Database", "currently", "Scheduled: daily");

              // reset for next iteration of loop
              dontCacheResultsRadioButton().click();
              saveCacheStrategyForm({ strategyType: "nocache", model });
              scheduleRadioButton().click();
            });
          });
        });

        it(`can save a new weekly schedule policy - for ${itemName}`, () => {
          [
            ["Sunday", "12:00 AM"],
            ["Monday", "1:00 AM"],
            ["Tuesday", "11:00 AM"],
            ["Wednesday", "12:00 PM"],
            ["Thursday", "1:00 PM"],
            ["Friday", "7:00 PM"],
            ["Saturday", "11:00 PM"],
          ].forEach(([day, time]) => {
            cy.log(`testing on ${day} at ${time}`);
            selectScheduleType("weekly");
            cy.findAllByRole("searchbox").eq(1).click();
            cy.findByRole("listbox").findByText(day).click();
            cy.findAllByRole("searchbox").eq(2).click();
            const [hour, amPm] = time.split(" ");
            cy.findByRole("listbox").findByText(hour).click();
            cy.findByLabelText(amPm).next().click();
            saveCacheStrategyForm({ strategyType: "schedule", model });
            formLauncher(itemName, "currently", "Scheduled: weekly");
            cy.findAllByRole("searchbox").then(searchBoxes => {
              const values = Cypress._.map(
                searchBoxes,
                box => (box as HTMLInputElement).value,
              );
              expect(values).to.deep.equal(["weekly", day, hour]);
            });
            cy.findByRole("radio", { name: amPm }).should("be.checked");

            // reset for next iteration of loop
            dontCacheResultsRadioButton().click();
            saveCacheStrategyForm({ strategyType: "nocache", model });
            scheduleRadioButton().click();
          });
        });
      });
    });

    describe("Dashboard and question caching tab", () => {
      it("can configure Sample Database on the 'Dashboard and question caching' tab", () => {
        interceptPerformanceRoutes();
        visitDashboardAndQuestionCachingTab();
        dashboardAndQuestionsTable()
          .should("be.visible")
          .contains(
            "No dashboards or questions have their own caching policies yet.",
          );
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        durationRadioButton().click();
        cy.findByLabelText(/Cache results for this many hours/).type("99");
        saveCacheStrategyForm({ strategyType: "duration", model: "database" });
        visitDashboardAndQuestionCachingTab();
        dashboardAndQuestionsTable()
          .contains("Duration: 99h")
          .within(() => {
            cy.findByText("Duration: 99h").click();
          });
        adaptiveRadioButton().click();
        saveCacheStrategyForm({ strategyType: "ttl", model: "database" });
      });

      it("confirmation modal appears before dirty form is abandoned", () => {
        interceptPerformanceRoutes();
        visitDashboardAndQuestionCachingTab();
        dashboardAndQuestionsTable()
          .should("be.visible")
          .contains(
            "No dashboards or questions have their own caching policies yet.",
          );
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        durationRadioButton().click();
        cy.findByLabelText(/Cache results for this many hours/).type("99");
        saveCacheStrategyForm({ strategyType: "duration", model: "database" });
        visitDashboardAndQuestionCachingTab();
        dashboardAndQuestionsTable()
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
        visitDashboardAndQuestionCachingTab();
        dashboardAndQuestionsTable().contains("Adaptive");
        dashboardAndQuestionsTable()
          .contains("Duration: 24h")
          .within(() => {
            cy.findByText("Duration: 24h").click();
          });

        cy.log("Make form dirty");
        scheduleRadioButton().click();

        cy.log("Modal appears when another row's form launcher is clicked");
        dashboardAndQuestionsTable()
          .contains("Adaptive")
          .within(() => {
            cy.findByText("Adaptive").click();
          });
        cancelConfirmationModal();

        cy.log("Modal appears when another admin nav item is clicked");
        cy.findByLabelText("Navigation bar").within(() => {
          cy.findByText("Settings").click();
        });
        cancelConfirmationModal();

        cy.log("Modal appears when another Performance tab is clicked");
        cy.findByRole("tab", { name: "Database caching" }).click();
        cancelConfirmationModal();
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
        visitDashboardAndQuestionCachingTab();
        dashboardAndQuestionsTable()
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
        visitDashboardAndQuestionCachingTab();
        dashboardAndQuestionsTable()
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

      it("Preemptive caching is not available for other caching policies, or for databases", () => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        openSidebarCacheStrategyForm("question");
        preemptiveCachingSwitch().should("not.exist");

        adaptiveRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");

        dontCacheResultsRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");

        openStrategyFormForDatabaseOrDefaultPolicy(
          "default policy",
          "No caching",
        );
        durationRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");
        scheduleRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");

        openStrategyFormForDatabaseOrDefaultPolicy(
          "Sample Database",
          "No caching",
        );
        durationRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");
        scheduleRadioButton().click();
        preemptiveCachingSwitch().should("not.exist");
      });
    });
  });
});
