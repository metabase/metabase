import { describeEE, restore, setTokenFeatures } from "e2e/support/helpers";

const save = ({ expectedRoute = "@putCacheConfig" } = {}) => {
  cy.log("Save the caching strategy form");
  cy.button(/Save/).click();
  cy.wait(expectedRoute);
};

const launchFormForItem = (itemName: string, currentStrategy: string) => {
  cy.visit("/admin");
  cy.findByRole("link", { name: "Performance" }).click();
  cy.findByRole("tab", { name: "Database caching settings" }).click();
  cy.log(`Open strategy form for ${itemName}`);
  formLauncher(itemName, "currently", currentStrategy).click();
};

const main = () => cy.findByRole("main", { name: "Database caching settings" });

const form = () => cy.findByLabelText("Select the cache invalidation policy");

const radio = (name: RegExp) => form().findByRole("radio", { name });

const durationRadioButton = () => radio(/Duration/);
const adaptiveRadioButton = () => radio(/Adaptive/);
const scheduleRadioButton = () => radio(/Schedule/);
const dontCacheResultsRadioButton = () => radio(/Don.t cache results/);
const useDefaultRadioButton = () => radio(/Use default/);

const formLauncher = (
  itemName: string,
  preface: string,
  strategyLabel: string,
) => {
  main().should("exist");
  cy.log(
    `Finding strategy for launcher for regex: Edit.*${itemName}.*${preface}.*${strategyLabel}`,
  );
  const launcher = main().findByLabelText(
    new RegExp(`Edit.*${itemName}.*${preface}.*${strategyLabel}`),
  );
  launcher.should("exist");
  return launcher;
};

// NOTE: These tests just check that the form can be saved. They do not test
// whether the cache is actually invalidated at the specified times.

describe("scenarios > admin > performance", { tags: "@OSS" }, () => {
  beforeEach(() => {
    restore();
    cy.intercept("PUT", "/api/cache").as("putCacheConfig");
    cy.intercept("DELETE", "/api/cache").as("deleteCacheConfig");
    cy.intercept("POST", "/api/persist/enable").as("enablePersistence");
    cy.intercept("POST", "/api/persist/disable").as("disablePersistence");
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
    form().findAllByRole("radio").should("have.length", 2);
    adaptiveRadioButton().should("exist");
    dontCacheResultsRadioButton().should("exist");
  });

  it("can set default policy to Don't cache results", () => {
    cy.log("Set default policy to Adaptive first");
    adaptiveRadioButton().click();
    save();
    adaptiveRadioButton().should("be.checked");

    cy.log("Then set default policy to Don't cache results");
    dontCacheResultsRadioButton().click();
    save({
      expectedRoute: "@deleteCacheConfig",
    });
    dontCacheResultsRadioButton().should("be.checked");
  });

  describe("adaptive strategy", () => {
    it("can set default policy to adaptive", () => {
      adaptiveRadioButton().click();
      save();
      adaptiveRadioButton().should("be.checked");
    });

    it("can configure a minimum query duration for the default adaptive policy", () => {
      adaptiveRadioButton().click();
      cy.findByLabelText(/Minimum query duration/).type("1000");
      save();
      adaptiveRadioButton().should("be.checked");
      cy.findByLabelText(/Minimum query duration/).should("have.value", "1000");
    });

    it("can configure a multiplier for the default adaptive policy", () => {
      adaptiveRadioButton().click();
      cy.findByLabelText(/Multiplier/).type("3");
      save();
      adaptiveRadioButton().should("be.checked");
      cy.findByLabelText(/Multiplier/).should("have.value", "3");
    });

    it("can configure both a minimum query duration and a multiplier for the default adaptive policy", () => {
      adaptiveRadioButton().click();
      cy.findByLabelText(/Minimum query duration/).type("1234");
      cy.findByLabelText(/Multiplier/).type("4");
      save();
      adaptiveRadioButton().should("be.checked");
      cy.findByLabelText(/Minimum query duration/).should("have.value", "1234");
      cy.findByLabelText(/Multiplier/).should("have.value", "4");
    });
  });
});

describeEE("EE", () => {
  beforeEach(() => {
    restore();
    cy.intercept("PUT", "/api/cache").as("putCacheConfig");
    cy.intercept("DELETE", "/api/cache").as("deleteCacheConfig");
    cy.intercept(
      "POST",
      "/api/cache/invalidate?include=overrides&database=1",
    ).as("invalidateCacheForSampleDatabase");
    cy.intercept("POST", "/api/persist/enable").as("enablePersistence");
    cy.intercept("POST", "/api/persist/disable").as("disablePersistence");
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  const checkInheritanceIfNeeded = (itemName: string, strategyName: string) => {
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

  it("can call cache invalidation endpoint for Sample Database", () => {
    launchFormForItem("default policy", "No caching");
    cy.log('A "Clear cache" button is not present for the default policy');
    cy.button(/Clear cache/).should("not.exist");

    launchFormForItem("Sample Database", "No caching");
    cy.log(
      'A "Clear cache" button is not yet present because the database does not use a cache',
    );
    cy.button(/Clear cache/).should("not.exist");

    cy.log("Set Sample Database's caching policy to Duration");
    durationRadioButton().click();

    cy.log("Save the caching strategy form");
    save();

    cy.log("Now there's a 'Clear cache' button. Click it");
    cy.button(/Clear cache/).click();

    cy.log('Confirm via the "Clear cache" dialog');
    cy.findByRole("dialog")
      .button(/Clear cache/)
      .click();

    cy.wait("@invalidateCacheForSampleDatabase");

    cy.log("The cache has been cleared");
    cy.button(/Cache cleared/);
  });

  [/Duration/, /Schedule/, /Adaptive/].forEach(strategy => {
    const strategyAsString = strategy.toString().replace(/\//g, "");
    it(`can configure Sample Database to use a default policy of ${strategyAsString}`, () => {
      cy.log(`Set default policy to ${strategy}`);
      launchFormForItem("default policy", "No caching");
      radio(strategy).click();
      save();

      cy.log("Open strategy form for Sample Database");
      launchFormForItem("Sample Database", strategyAsString);

      cy.log("Set Sample Database to Duration first");
      durationRadioButton().click();
      save();
      formLauncher("Sample Database", "currently", "Duration");

      cy.log("Then configure Sample Database to use the default policy");
      useDefaultRadioButton().click();
      save({ expectedRoute: "@deleteCacheConfig" });
      formLauncher("Sample Database", "currently inheriting", strategyAsString);
    });
  });

  ["default policy", "Sample Database"].forEach(itemName => {
    const expectedNumberOfOptions = itemName === "default policy" ? 4 : 5;
    it(`there are ${expectedNumberOfOptions} policy options for ${itemName}`, () => {
      launchFormForItem(itemName, "No caching");
      form()
        .findAllByRole("radio")
        .should("have.length", expectedNumberOfOptions);
    });

    it(`can set ${itemName} to Don't cache results`, () => {
      launchFormForItem(itemName, "No caching");
      cy.log(`Set ${itemName} to Duration first`);
      durationRadioButton().click();
      save();
      formLauncher(itemName, "currently", "Duration");

      cy.log(`Then set ${itemName} to Don't cache results`);
      dontCacheResultsRadioButton().click();
      // When the default policy is set to "Don't cache results", we delete the
      // policy, but when a database's policy is set to "Don't cache results",
      // we set its policy to "nocache". When a database's policy is set to
      // "Use default", then we delete its policy.
      save({
        expectedRoute:
          itemName === "default policy"
            ? "@deleteCacheConfig"
            : "@putCacheConfig",
      });
      formLauncher(itemName, "currently", "No caching");
      checkInheritanceIfNeeded(itemName, "No caching");
    });

    it(`can set ${itemName} to a duration-based cache invalidation policy`, () => {
      launchFormForItem(itemName, "No caching");
      cy.log(`Set ${itemName} to Duration`);
      durationRadioButton().click();
      save();
      cy.log(`${itemName} is now set to Duration`);
      formLauncher(itemName, "currently", "Duration");
      checkInheritanceIfNeeded(itemName, "Duration");
    });

    describe("adaptive strategy", () => {
      beforeEach(() => {
        launchFormForItem(itemName, "No caching");
        adaptiveRadioButton().click();
      });

      it(`can set ${itemName} to adaptive`, () => {
        save();
        formLauncher(itemName, "currently", "Adaptive");
        checkInheritanceIfNeeded(itemName, "Adaptive");
      });

      it(`can configure a minimum query duration for ${itemName}'s adaptive policy`, () => {
        cy.findByLabelText(/Minimum query duration/).type("1000");
        save();
        formLauncher(itemName, "currently", "Adaptive");
        cy.findByLabelText(/Minimum query duration/).should(
          "have.value",
          "1000",
        );
      });

      it(`can configure a multiplier for ${itemName}'s adaptive policy`, () => {
        cy.findByLabelText(/Multiplier/).type("3");
        save();
        formLauncher(itemName, "currently", "Adaptive");
        cy.findByLabelText(/Multiplier/).should("have.value", "3");
      });

      it(`can configure both a minimum query duration and a multiplier for ${itemName}'s adaptive policy`, () => {
        cy.findByLabelText(/Minimum query duration/).type("1234");
        cy.findByLabelText(/Multiplier/).type("4");
        save();
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
        save();
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
            save();
            formLauncher("Sample Database", "currently", "Scheduled: daily");

            // reset for next iteration of loop
            dontCacheResultsRadioButton().click();
            save({
              expectedRoute:
                itemName === "default policy"
                  ? "@deleteCacheConfig"
                  : "@putCacheConfig",
            });
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
          save();
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
          save({
            expectedRoute:
              itemName === "default policy"
                ? "@deleteCacheConfig"
                : "@putCacheConfig",
          });
          scheduleRadioButton().click();
        });
      });
    });
  });
});
