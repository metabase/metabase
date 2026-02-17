import { onlyOn } from "@cypress/skip-test";

import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

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
      H.restore();
    });

    Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
      context(`${permission} access`, () => {
        userGroup.forEach((user) => {
          onlyOn(permission === "curate", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as(
                  "updateQuestion",
                );

                cy.signIn(user);
                H.visitQuestion(ORDERS_QUESTION_ID);
              });

              it("should be able to edit question details (metabase#11719-1)", () => {
                cy.findByTestId("saved-question-header-title")
                  .click()
                  .type("1")
                  .blur();
                assertRequestNot403("updateQuestion");
                assertNoPermissionsError();
                // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Orders1");
              });

              it("should be able to edit a question's description", () => {
                H.questionInfoButton().click();

                cy.findByPlaceholderText("Add description")
                  .type("foo", { delay: 0 })
                  .blur();

                assertRequestNot403("updateQuestion");
                assertNoPermissionsError();

                // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                cy.findByText("foo");
              });

              describe("move", () => {
                it("should be able to move the question (metabase#11719-2)", () => {
                  H.openNavigationSidebar();
                  H.navigationSidebar().within(() => {
                    // Highlight "Our analytics"
                    cy.findByText("Our analytics")
                      .parents("li")
                      .should("have.attr", "aria-selected", "true");
                    cy.findByText("Your personal collection")
                      .parents("li")
                      .should("have.attr", "aria-selected", "false");
                  });

                  moveQuestionTo(/Personal Collection/);
                  assertRequestNot403("updateQuestion");

                  cy.findAllByRole("status")
                    .contains(
                      `Question moved to ${H.getPersonalCollectionName(
                        USERS[user],
                      )}`,
                    )
                    .should("exist");
                  assertNoPermissionsError();
                  cy.findAllByRole("gridcell").contains("37.65");

                  H.navigationSidebar().within(() => {
                    // Highlight "Your personal collection" after move
                    cy.findByText("Our analytics")
                      .parents("li")
                      .should("have.attr", "aria-selected", "false");
                    cy.findByText("Your personal collection")
                      .parents("li")
                      .should("have.attr", "aria-selected", "true");
                  });

                  if (user === "admin") {
                    H.openQuestionActions();
                    cy.findByTestId("move-button").click();
                    H.entityPickerModal().within(() => {
                      cy.findByText("Recent items").click();
                      H.entityPickerModalLevel(1).within(() => {
                        cy.findByRole("link", {
                          name: /Orders in a dashboard/,
                        }).should("exist");
                        cy.findByRole("link", { name: /Bobby Table/ }).should(
                          "not.exist",
                        );
                      });
                    });
                  }
                });

                it("should be able to move the question to a collection created on the go", () => {
                  const NEW_COLLECTION_NAME = "Foo";

                  H.openQuestionActions();
                  cy.findByTestId("move-button").click();
                  H.entityPickerModal().within(() => {
                    cy.findByText(/Personal Collection/).click();
                    cy.findByText("New collection").click();
                  });

                  cy.findByTestId("create-collection-on-the-go").within(() => {
                    cy.findByPlaceholderText("My new collection").type(
                      NEW_COLLECTION_NAME,
                    );
                    cy.button("Create").click();
                  });

                  H.entityPickerModal().button("Move").click();

                  cy.get("header").findByText(NEW_COLLECTION_NAME);
                });

                it("should be able to move models", () => {
                  // TODO: Currently nodata users can't turn a question into a model
                  cy.skipOn(user === "nodata");

                  turnIntoModel();

                  H.openNavigationSidebar();
                  H.navigationSidebar().within(() => {
                    // Highlight "Our analytics"
                    cy.findByText("Our analytics")
                      .parents("li")
                      .should("have.attr", "aria-selected", "true");
                    cy.findByText("Your personal collection")
                      .parents("li")
                      .should("have.attr", "aria-selected", "false");
                  });

                  moveQuestionTo(/Personal Collection/);
                  assertRequestNot403("updateQuestion");

                  cy.findAllByRole("status")
                    .contains(
                      `Model moved to ${H.getPersonalCollectionName(
                        USERS[user],
                      )}`,
                    )
                    .should("exist");
                  assertNoPermissionsError();
                  cy.findAllByRole("gridcell").contains("37.65");

                  H.navigationSidebar().within(() => {
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
                  H.openQuestionActions();
                  cy.findByTestId("add-to-dashboard-button").click();

                  H.entityPickerModal()
                    .as("modal")
                    .within(() => {
                      cy.findByText("Our analytics").click();
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
                  H.createCollection(collectionInRoot);
                  H.createDashboard(dashboardInRoot);

                  cy.request("/api/user/current").then(
                    ({ body: { personal_collection_id } }) => {
                      H.createDashboard(
                        {
                          name: "Personal Dashboard",
                          collection_id: personal_collection_id,
                        },
                        {
                          wrapId: true,
                        },
                      );

                      // Simulate a couple gets, so that the dashboards appears in recents for various users
                      cy.get("@dashboardId").then((dashboardId) => {
                        cy.request(`/api/dashboard/${dashboardId}`);
                        cy.request(`/api/dashboard/${ORDERS_DASHBOARD_ID}`);
                      });
                    },
                  );

                  cy.log(
                    "reload the page so the new collection is in the state",
                  );
                  cy.reload();

                  cy.log("Move the question to a personal collection");

                  moveQuestionTo(/Personal Collection/);

                  cy.log("assert public collections are not visible");
                  H.openQuestionActions();
                  H.popover().findByText("Add to dashboard").click();

                  H.entityPickerModal().within(() => {
                    cy.findByText("Add this question to a dashboard").should(
                      "be.visible",
                    );

                    cy.findByRole("link", {
                      name: /Personal Dashboard/,
                    }).should("exist");
                    cy.findByRole("link", {
                      name: /Orders in a dashboard/,
                    }).should("not.exist");

                    cy.findByText(/'s personal collection/i).should(
                      "be.visible",
                    );
                    cy.findByText(/our analytics/i).should("not.exist");
                    cy.findByLabelText("Close").click();
                  });

                  cy.log("Move the question to the root collection");
                  moveQuestionTo("Our analytics");

                  cy.log("assert all collections are visible");
                  H.openQuestionActions();
                  H.popover().findByText("Add to dashboard").click();
                  H.entityPickerModal().within(() => {
                    cy.findByText("Add this question to a dashboard").should(
                      "be.visible",
                    );
                    cy.findByText("Recent items").click();
                    cy.findByRole("link", {
                      name: /Personal Dashboard/,
                    }).should("exist");
                    cy.findByRole("link", {
                      name: /Orders in a dashboard/,
                    }).should("exist");

                    H.entityPickerModalLevel(0).within(() => {
                      cy.findByText(/'s personal collection/i).should(
                        "be.visible",
                      );
                      cy.findByText(/our analytics/i).should("be.visible");
                    });
                  });
                });

                onlyOn(user === "normal", () => {
                  it("should preselect the most recently visited dashboard", () => {
                    H.openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    findInactivePickerItem("Orders in a dashboard");

                    // before visiting the dashboard, we don't have any history
                    H.visitDashboard(ORDERS_DASHBOARD_ID);
                    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

                    H.openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    H.pickEntity({
                      path: ["Our analytics", "Orders in a dashboard"],
                    });
                  });

                  it("should handle lost access", () => {
                    cy.intercept(
                      "GET",
                      "/api/activity/most_recently_viewed_dashboard",
                    ).as("mostRecentlyViewedDashboard");

                    H.openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");
                    findInactivePickerItem("Orders in a dashboard");

                    // before visiting the dashboard, we don't have any history
                    H.visitDashboard(ORDERS_DASHBOARD_ID);
                    H.visitQuestion(ORDERS_QUESTION_ID);

                    H.openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");

                    findActivePickerItem("Orders in a dashboard");

                    H.entityPickerModal().findByLabelText("Close").click();

                    cy.signInAsAdmin();

                    // Let's revoke write access to "Our analytics"
                    cy.updateCollectionGraph({
                      [USER_GROUPS.COLLECTION_GROUP]: { root: "read" },
                    });
                    cy.signOut();
                    cy.reload();
                    cy.signIn(user);
                    H.visitQuestion(ORDERS_QUESTION_ID);

                    H.openQuestionActions();
                    cy.findByTestId("add-to-dashboard-button").click();

                    cy.wait("@mostRecentlyViewedDashboard");

                    H.entityPickerModalItem(1, "Orders in a dashboard").should(
                      "have.attr",
                      "data-disabled",
                      "true",
                    );
                  });
                });
              });
            });
          });

          onlyOn(permission === "view", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.signIn(user);
                H.visitQuestion(ORDERS_QUESTION_ID);
              });

              it("should not be offered to add question to dashboard inside a collection they have `read` access to", () => {
                H.openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                findInactivePickerItem("Orders in a dashboard");

                H.entityPickerModal().within(() => {
                  cy.findByPlaceholderText(/Search/).type(
                    "Orders in a dashboard{Enter}",
                    { delay: 0 },
                  );
                  cy.findByText(/didn't find anything/).should("be.visible");
                });
              });

              it("should not offer a user the ability to update or clone the question", () => {
                cy.findByTestId("edit-details-button").should("not.exist");
                cy.findByRole("button", { name: "Add a description" }).should(
                  "not.exist",
                );

                H.openQuestionActions();

                H.popover().within(() => {
                  cy.findByTestId("move-button").should("not.exist");
                  cy.findByTestId("clone-button").should("not.exist");
                  cy.findByTestId("archive-button").should("not.exist");
                });

                // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Revert").should("not.exist");
              });

              it("should not preselect the most recently visited dashboard", () => {
                H.openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                H.entityPickerModal()
                  .findByText(/Orders in a dashboard/)
                  .closest("a")
                  .should("have.attr", "data-disabled", "true");

                // before visiting the dashboard, we don't have any history
                H.visitDashboard(ORDERS_DASHBOARD_ID);
                H.visitQuestion(ORDERS_QUESTION_ID);

                H.openQuestionActions();
                cy.findByTestId("add-to-dashboard-button").click();

                H.entityPickerModal()
                  .findByText(/Orders in a dashboard/)
                  .closest("a")
                  .should("have.attr", "data-disabled", "true");
              });
            });
          });
        });
      });
    });
  },
);

describe("question moving", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as("updateQuestion");
    H.visitQuestion(ORDERS_QUESTION_ID);
  });

  it("should move a question between collections", () => {
    H.appBar().findByText("Our analytics").should("be.visible");
    cy.findByTestId("qb-header-action-panel")
      .icon("ellipsis")
      .closest("button")
      .click();
    H.popover().findByTestId("move-button").click();
    H.pickEntity({
      path: ["Our analytics", "First collection", "Second collection"],
      select: true,
    });
    cy.wait("@updateQuestion").its("response.statusCode").should("eq", 200);
    cy.findAllByRole("status").contains("Question moved to Second collection");
    H.appBar().findByText("Second collection").should("be.visible");
    H.modal().should("not.exist");
  });

  it("should show an error when moving a question fails", () => {
    cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      statusCode: 400,
      body: { message: "Sorry buddy, only cool kids in this collection" },
    }).as("updateQuestion");

    H.appBar().findByText("Our analytics").should("be.visible");
    cy.findByTestId("qb-header-action-panel")
      .icon("ellipsis")
      .closest("button")
      .click();
    H.popover().findByTestId("move-button").click();
    H.pickEntity({
      path: ["Our analytics", "First collection", "Second collection"],
      select: true,
    });
    cy.wait("@updateQuestion");
    H.modal()
      .findByText("Sorry buddy, only cool kids in this collection")
      .should("be.visible");
  });
});

describe("send snowplow question events", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should send event when clicking `Turn into a model`", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Turn into a model").click();
    });
    H.expectUnstructuredSnowplowEvent({ event: "turn_into_model_clicked" });
  });
});

function assertRequestNot403(xhr_alias) {
  cy.wait("@" + xhr_alias).then((xhr) => {
    expect(xhr.status).not.to.eq(403);
  });
}

function assertNoPermissionsError() {
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
}

function turnIntoModel() {
  H.openQuestionActions();
  cy.findByRole("menu").contains("Turn into a model").click();
  cy.findByRole("dialog").contains("Turn this into a model").click();
  assertRequestNot403("updateQuestion");
  cy.findAllByRole("status").contains("This is a model now.").should("exist");
  assertNoPermissionsError();
}

function findPickerItem(name) {
  return cy.findByTestId("entity-picker-modal").findByText(name).parents("a");
}

function findActivePickerItem(name) {
  return findPickerItem(name).then(($button) => {
    expect($button).to.have.attr("data-active", "true");
  });
}

function findInactivePickerItem(name) {
  return findPickerItem(name).then(($button) => {
    expect($button).not.to.have.attr("data-active", "true");
  });
}

function moveQuestionTo(newCollectionName) {
  H.openQuestionActions();
  cy.findByTestId("move-button").click();
  H.entityPickerModal().within(() => {
    cy.findByText(newCollectionName).click();
    cy.button("Move").click();
  });
}
