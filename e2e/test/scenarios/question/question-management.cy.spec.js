import { onlyOn } from "@cypress/skip-test";
import _ from "underscore";

import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import {
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitQuestion,
  visitDashboard,
  popover,
  openNavigationSidebar,
  navigationSidebar,
  openQuestionActions,
  questionInfoButton,
  getPersonalCollectionName,
  describeWithSnowplow,
  resetSnowplow,
  enableTracking,
  expectNoBadSnowplowEvents,
  expectGoodSnowplowEvents,
  modal,
  entityPickerModal,
} from "e2e/support/helpers";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

describe(
  "managing question from the question's details sidebar",
  { tags: "@slow" },
  () => {
    beforeEach(() => {
      restore();
    });

    Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
      context(`${permission} access`, () => {
        userGroup.forEach(user => {
          onlyOn(permission === "curate", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as(
                  "updateQuestion",
                );

                cy.signIn(user);
                visitQuestion(ORDERS_QUESTION_ID);
              });

              it("should be able to edit question details (metabase#11719-1)", () => {
                cy.findByTestId("saved-question-header-title")
                  .click()
                  .type("1")
                  .blur();
                assertRequestNot403("updateQuestion");
                assertNoPermissionsError();
                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Orders1");
              });

              it("should be able to edit a question's description", () => {
                questionInfoButton().click();

                cy.findByPlaceholderText("Add description")
                  .type("foo", { delay: 0 })
                  .blur();

                assertRequestNot403("updateQuestion");
                assertNoPermissionsError();

                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("foo");
              });

              describe("move", () => {
                it("should be able to move the question (metabase#11719-2)", () => {
                  openNavigationSidebar();
                  navigationSidebar().within(() => {
                    // Highlight "Our analytics"
                    cy.findByText("Our analytics")
                      .parents("li")
                      .should("have.attr", "aria-selected", "true");
                    cy.findByText("Your personal collection")
                      .parents("li")
                      .should("have.attr", "aria-selected", "false");
                  });

                  moveQuestionTo(/Personal Collection/, user === "admin");
                  assertRequestNot403("updateQuestion");

                  cy.findAllByRole("status")
                    .contains(
                      `Question moved to ${getPersonalCollectionName(
                        USERS[user],
                      )}`,
                    )
                    .should("exist");
                  assertNoPermissionsError();
                  cy.findAllByRole("gridcell").contains("37.65");

                  navigationSidebar().within(() => {
                    // Highlight "Your personal collection" after move
                    cy.findByText("Our analytics")
                      .parents("li")
                      .should("have.attr", "aria-selected", "false");
                    cy.findByText("Your personal collection")
                      .parents("li")
                      .should("have.attr", "aria-selected", "true");
                  });
                });

                it("should be able to move the question to a collection created on the go", () => {
                  const NEW_COLLECTION_NAME = "Foo";

                  openQuestionActions();
                  cy.findByTestId("move-button").click();
                  entityPickerModal().within(() => {
                    if (user === "admin") {
                      cy.findByRole("tab", { name: /Collections/ }).click();
                    }
                    cy.findByText(/Personal Collection/).click();
                    cy.findByText("Create a new collection").click();
                  });

                  cy.findByTestId("create-collection-on-the-go").within(() => {
                    cy.findByPlaceholderText("My new collection").type(
                      NEW_COLLECTION_NAME,
                    );
                    cy.button("Create").click();
                  });

                  entityPickerModal().button("Move").click();

                  cy.get("header").findByText(NEW_COLLECTION_NAME);
                });

                it("should be able to move models", () => {
                  // TODO: Currently nodata users can't turn a question into a model
                  cy.skipOn(user === "nodata");

                  turnIntoModel();

                  openNavigationSidebar();
                  navigationSidebar().within(() => {
                    // Highlight "Our analytics"
                    cy.findByText("Our analytics")
                      .parents("li")
                      .should("have.attr", "aria-selected", "true");
                    cy.findByText("Your personal collection")
                      .parents("li")
                      .should("have.attr", "aria-selected", "false");
                  });

                  moveQuestionTo(/Personal Collection/, user === "admin");
                  assertRequestNot403("updateQuestion");

                  cy.findAllByRole("status")
                    .contains(
                      `Model moved to ${getPersonalCollectionName(
                        USERS[user],
                      )}`,
                    )
                    .should("exist");
                  assertNoPermissionsError();
                  cy.findAllByRole("gridcell").contains("37.65");

                  navigationSidebar().within(() => {
                    // Highlight "Your personal collection" after move
                    cy.findByText("Our analytics")
                      .parents("li")
                      .should("have.attr", "aria-selected", "false");
                    cy.findByText("Your personal collection")
                      .parents("li")
                      .should("have.attr", "aria-selected", "true");
                  });
                });
              });

              describe("Add to Dashboard", () => {
                it("should be able to add question to dashboard", () => {
                  openQuestionActions();
                  cy.findByTestId("add-to-dashboard-button").click();

                  entityPickerModal()
                    .as("modal")
                    .within(() => {
                      cy.findByText("Orders in a dashboard").click();
                      cy.button("Select").click();
                    });

                  cy.get("@modal").should("not.exist");
                  // By default, the dashboard contains one question
                  // After we add a new one, we check there are two questions now
                  cy.findAllByTestId("dashcard-container").should(
                    "have.length",
                    2,
                  );
                });

                it("should hide public collections when selecting a dashboard for a question in a personal collection", () => {
                  const collectionInRoot = {
                    name: "Collection in root collection",
                  };
                  const dashboardInRoot = {
                    name: "Dashboard in root collection",
                  };
                  cy.createCollection(collectionInRoot);
                  cy.createDashboard(dashboardInRoot);
                  cy.log(
                    "reload the page so the new collection is in the state",
                  );
                  cy.reload();

                  cy.log("Move the question to a personal collection");

                  moveQuestionTo(/Personal Collection/, true);

                  cy.log("assert public collections are not visible");
                  openQuestionActions();
                  popover().findByText("Add to dashboard").click();
                  clickTabForUser(user, "Dashboards");

                  entityPickerModal().within(() => {
                    cy.findByText("Add this question to a dashboard").should(
                      "be.visible",
                    );

                    clickTabForUser(user, "Dashboards");

                    cy.findByText(/'s personal collection/i).should(
                      "be.visible",
                    );
                    cy.findByText(/our analytics/i).should("not.exist");
                    cy.findByLabelText("Close").click();
                  });

                  cy.log("Move the question to the root collection");
                  moveQuestionTo("Our analytics", true);

                  cy.log("assert all collections are visible");
                  openQuestionActions();
                  popover().findByText("Add to dashboard").click();
                  modal().within(() => {
                    cy.findByText("Add this question to a dashboard").should(
                      "be.visible",
                    );

                    clickTabForUser(user, "Dashboards");
                    cy.findByText(/'s personal collection/i).should(
                      "be.visible",
                    );
                    cy.findByText(/our analytics/i).should("be.visible");
                  });
                });

                onlyOn(user === "normal", () => {
                  it("should preselect the most recently visited dashboard", () => {
                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    findInactivePickerItem("Orders in a dashboard");

                    // before visiting the dashboard, we don't have any history
                    visitDashboard(ORDERS_DASHBOARD_ID);
                    visitQuestion(ORDERS_COUNT_QUESTION_ID);

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    findSelectedPickerItem("Orders in a dashboard");
                  });

                  it("should handle lost access", () => {
                    cy.intercept(
                      "GET",
                      "/api/activity/most_recently_viewed_dashboard",
                    ).as("mostRecentlyViewedDashboard");

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");
                    findInactivePickerItem("Orders in a dashboard");

                    // before visiting the dashboard, we don't have any history
                    visitDashboard(ORDERS_DASHBOARD_ID);
                    visitQuestion(ORDERS_QUESTION_ID);

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");
                    entityPickerModal()
                      .findByRole("tab", { name: /Dashboards/ })
                      .click();

                    findActivePickerItem("Orders in a dashboard");

                    entityPickerModal().findByLabelText("Close").click();

                    cy.signInAsAdmin();

                    // Let's revoke write access to "Our analytics"
                    cy.updateCollectionGraph({
                      [USER_GROUPS.COLLECTION_GROUP]: { root: "read" },
                    });
                    cy.signOut();
                    cy.reload();
                    cy.signIn(user);
                    visitQuestion(ORDERS_QUESTION_ID);

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");

                    entityPickerModal()
                      .button(/Orders in a dashboard/)
                      .should("be.disabled");
                  });
                });
              });
            });
          });

          onlyOn(permission === "view", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.signIn(user);
                visitQuestion(ORDERS_QUESTION_ID);
              });

              it("should not be offered to add question to dashboard inside a collection they have `read` access to", () => {
                openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                entityPickerModal()
                  .findByText("First collection")
                  .should("be.visible");

                findPickerItem("Orders in a dashboard").then($button => {
                  expect($button).to.have.attr("disabled");
                });
                entityPickerModal().within(() => {
                  cy.findByPlaceholderText(/Search/).type(
                    "Orders in a dashboard{Enter}",
                    { delay: 0 },
                  );
                  cy.findByText(/weren't any results/).should("be.visible");
                });
              });

              it("should not offer a user the ability to update or clone the question", () => {
                cy.findByTestId("edit-details-button").should("not.exist");
                cy.findByRole("button", { name: "Add a description" }).should(
                  "not.exist",
                );

                openQuestionActions();

                popover().within(() => {
                  cy.findByTestId("move-button").should("not.exist");
                  cy.findByTestId("clone-button").should("not.exist");
                  cy.findByTestId("archive-button").should("not.exist");
                });

                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Revert").should("not.exist");
              });

              it("should not preselect the most recently visited dashboard", () => {
                openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                entityPickerModal()
                  .findByText("Orders in a dashboard")
                  .should("not.exist");

                // before visiting the dashboard, we don't have any history
                visitDashboard(ORDERS_DASHBOARD_ID);
                visitQuestion(ORDERS_QUESTION_ID);

                openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                // still no data
                entityPickerModal()
                  .findByText("Orders in a dashboard")
                  .should("not.exist");
              });
            });
          });
        });
      });
    });
  },
);

describeWithSnowplow("send snowplow question events", () => {
  const NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_MODEL_CONVERSION = 2;

  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send event when clicking `Turn into a model`", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    openQuestionActions();
    expectGoodSnowplowEvents(
      NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_MODEL_CONVERSION,
    );
    popover().within(() => {
      cy.findByText("Turn into a model").click();
    });
    expectGoodSnowplowEvents(
      NUMBERS_OF_GOOD_SNOWPLOW_EVENTS_BEFORE_MODEL_CONVERSION + 1,
    );
  });
});

function assertRequestNot403(xhr_alias) {
  cy.wait("@" + xhr_alias).then(xhr => {
    expect(xhr.status).not.to.eq(403);
  });
}

function assertNoPermissionsError() {
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
}

function turnIntoModel() {
  openQuestionActions();
  cy.findByRole("dialog").contains("Turn into a model").click();
  cy.findByRole("dialog").contains("Turn this into a model").click();
  assertRequestNot403("updateQuestion");
  cy.findAllByRole("status").contains("This is a model now.").should("exist");
  assertNoPermissionsError();
}

function findPickerItem(name) {
  return cy
    .findByTestId("entity-picker-modal")
    .findByText(name)
    .closest("button");
}

function findActivePickerItem(name) {
  return findPickerItem(name).then($button => {
    expect($button).to.have.attr("data-active", "true");
  });
}

function findSelectedPickerItem(name) {
  return findPickerItem(name).then($button => {
    expect($button).to.have.attr("aria-selected", "true");
  });
}

function findInactivePickerItem(name) {
  return findPickerItem(name).then($button => {
    expect($button).not.to.have.attr("data-active", "true");
  });
}

function moveQuestionTo(newCollectionName, clickTab = false) {
  openQuestionActions();
  cy.findByTestId("move-button").click();
  entityPickerModal().within(() => {
    clickTab && cy.findByRole("tab", { name: /Collections/ }).click();
    cy.findByText(newCollectionName).click();
    cy.button("Move").click();
  });
}

function clickTabForUser(user, tabName) {
  if (user === "admin") {
    cy.findAllByRole("tab")
      .contains(tabName)
      .then($el => $el && cy.wrap($el).click());
  }
}
