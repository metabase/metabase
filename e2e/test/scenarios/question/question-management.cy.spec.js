import { onlyOn } from "@cypress/skip-test";

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
  saveDashboard,
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
                assertOnRequest("updateQuestion");
                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Orders1");
              });

              it("should be able to edit a question's description", () => {
                questionInfoButton().click();

                cy.findByPlaceholderText("Add description")
                  .type("foo", { delay: 0 })
                  .blur();

                assertOnRequest("updateQuestion");

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

                  openQuestionActions();
                  cy.findByTestId("move-button").click();
                  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                  cy.findByText("My personal collection").click();
                  clickButton("Move");
                  assertOnRequest("updateQuestion");
                  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                  cy.contains("37.65");

                  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                  cy.contains(
                    `Question moved to ${getPersonalCollectionName(
                      USERS[user],
                    )}`,
                  );

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
                  openQuestionActions();
                  cy.findByTestId("move-button").click();
                  const NEW_COLLECTION = "Foo";

                  modal().within(() => {
                    cy.findByText("New collection").click();
                  });

                  cy.findByTestId("new-collection-modal").then(modal => {
                    cy.findByPlaceholderText(
                      "My new fantastic collection",
                    ).type(NEW_COLLECTION);
                    cy.findByText("Create").click();
                  });

                  cy.get("header").findByText(NEW_COLLECTION);
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

                  openQuestionActions();
                  cy.findByTestId("move-button").click();
                  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                  cy.findByText("My personal collection").click();
                  clickButton("Move");
                  assertOnRequest("updateQuestion");
                  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                  cy.contains("37.65");

                  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                  cy.contains(
                    `Model moved to ${getPersonalCollectionName(USERS[user])}`,
                  );

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

              it("should be able to archive the question (metabase#11719-3, metabase#16512, metabase#20133)", () => {
                cy.intercept("GET", "/api/collection/root/items**").as(
                  "getItems",
                );
                openQuestionActions();
                cy.findByTestId("archive-button").click();
                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText(
                  "It will also be removed from the filter that uses it to populate values.",
                ).should("not.exist");
                clickButton("Archive");
                assertOnRequest("updateQuestion");
                cy.wait("@getItems"); // pinned items
                cy.wait("@getItems"); // unpinned items
                cy.location("pathname").should("eq", "/collection/root");
                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Orders").should("not.exist");

                cy.findByPlaceholderText("Search…").click();
                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Recently viewed");
                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Nothing here");

                // Check page for archived questions
                cy.visit("/question/" + ORDERS_QUESTION_ID);
                // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
                cy.findByText("This question has been archived");
              });

              describe("Add to Dashboard", () => {
                it("should be able to add question to dashboard", () => {
                  openQuestionActions();
                  cy.findByTestId("add-to-dashboard-button").click();

                  modal()
                    .as("modal")
                    .findByText("Orders in a dashboard")
                    .click();

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
                  const myPersonalCollection = "My personal collection";
                  cy.createCollection(collectionInRoot);
                  cy.createDashboard(dashboardInRoot);
                  cy.log(
                    "reload the page so the new collection is in the state",
                  );
                  cy.reload();

                  cy.log("Move the question to a personal collection");
                  openQuestionActions();
                  popover().findByText("Move").click();
                  modal().within(() => {
                    cy.findByRole("heading", {
                      name: myPersonalCollection,
                    }).click();
                    cy.button("Move").click();
                  });

                  cy.log("assert public collections are not visible");
                  openQuestionActions();
                  popover().findByText("Add to dashboard").click();
                  modal().within(() => {
                    cy.findByText("Add this question to a dashboard").should(
                      "be.visible",
                    );
                    cy.findByText(myPersonalCollection).should("be.visible");
                    cy.findByText(collectionInRoot.name).should("not.exist");
                    cy.findByText(dashboardInRoot.name).should("not.exist");
                    cy.findByText("Create a new dashboard").should("not.exist");
                    cy.icon("close").click();
                  });

                  cy.log("Move the question to the root collection");
                  openQuestionActions();
                  popover().findByText("Move").click();
                  modal().within(() => {
                    cy.findByRole("heading", { name: "Our analytics" }).click();
                    cy.button("Move").click();
                  });

                  cy.log("assert all collections are visible");
                  openQuestionActions();
                  popover().findByText("Add to dashboard").click();
                  modal().within(() => {
                    cy.findByText("Add this question to a dashboard").should(
                      "be.visible",
                    );
                    cy.findByText("My personal collection").should(
                      "be.visible",
                    );
                    cy.findByText(collectionInRoot.name).should("be.visible");
                    cy.findByText(dashboardInRoot.name).should("be.visible");
                    cy.findByText("Create a new dashboard").should(
                      "be.visible",
                    );
                  });
                });

                onlyOn(user === "normal", () => {
                  it("should preselect the most recently visited dashboard", () => {
                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    findSelectedItem().should("not.exist");

                    // before visiting the dashboard, we don't have any history
                    visitDashboard(ORDERS_DASHBOARD_ID);
                    visitQuestion(ORDERS_COUNT_QUESTION_ID);

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    findSelectedItem().should(
                      "have.text",
                      "Orders in a dashboard",
                    );
                  });

                  it("should handle lost access", () => {
                    cy.intercept(
                      "GET",
                      "/api/activity/most_recently_viewed_dashboard",
                    ).as("mostRecentlyViewedDashboard");

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");

                    findSelectedItem().should("not.exist");

                    // before visiting the dashboard, we don't have any history
                    visitDashboard(ORDERS_DASHBOARD_ID);
                    visitQuestion(ORDERS_QUESTION_ID);

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");

                    findSelectedItem().should(
                      "have.text",
                      "Orders in a dashboard",
                    );

                    cy.findByRole("dialog").within(() => {
                      cy.icon("close").click();
                    });

                    cy.signInAsAdmin();

                    // Let's revoke access to "Our analytics"
                    cy.updateCollectionGraph({
                      [USER_GROUPS.COLLECTION_GROUP]: { root: "none" },
                    });

                    cy.signIn(user);

                    openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");

                    // no access - no dashboard
                    findSelectedItem().should("not.exist");
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

                cy.get(".Modal").within(() => {
                  cy.findByText("Orders in a dashboard").should("not.exist");
                  cy.icon("search").click();
                  cy.findByPlaceholderText("Search").type(
                    "Orders in a dashboard{Enter}",
                    { delay: 0 },
                  );
                  cy.findByText("Orders in a dashboard").should("not.exist");
                });
              });

              it("should offer personal collection as a save destination for a new dashboard", () => {
                const { first_name, last_name } = USERS[user];
                const personalCollection = `${first_name} ${last_name}'s Personal Collection`;
                openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                cy.get(".Modal").within(() => {
                  cy.findByText("Create a new dashboard").click();
                  cy.findByLabelText(/Which collection/).should(
                    "contain.text",
                    personalCollection,
                  );
                  cy.findByLabelText("Name").type("Foo", { delay: 0 });
                  cy.button("Create").click();
                });
                cy.url().should("match", /\/dashboard\/\d+-foo$/);
                saveDashboard();
                cy.get("header").findByText(personalCollection);
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

                findSelectedItem().should("not.exist");

                // before visiting the dashboard, we don't have any history
                visitDashboard(ORDERS_DASHBOARD_ID);
                visitQuestion(ORDERS_QUESTION_ID);

                openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                // still no data
                findSelectedItem().should("not.exist");
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

function clickButton(name) {
  cy.button(name).should("not.be.disabled").click();
}

function assertOnRequest(xhr_alias) {
  cy.wait("@" + xhr_alias).then(xhr => {
    expect(xhr.status).not.to.eq(403);
  });

  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
}

function turnIntoModel() {
  openQuestionActions();
  cy.findByText("Turn into a model").click();
  cy.findByText("Turn this into a model").click();
}

function findSelectedItem() {
  return cy.findByRole("dialog").findByRole("option", { selected: true });
}
