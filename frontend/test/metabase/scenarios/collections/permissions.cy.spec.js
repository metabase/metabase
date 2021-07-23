/**
 * FYI, this test suite contains permission tests for different pages
 *
 * - Collections (/collection/root)
 * - Dashboard (/dashboard/:id)
 * - Question (/question/:id)
 *
 * It's a WIP and most likely it will be split later,
 * when we're sure about our testing strategy for permissions
 * See discussion: https://github.com/metabase/metabase/pull/15573
 */

import { onlyOn } from "@cypress/skip-test";
import {
  restore,
  popover,
  sidebar,
  openNativeEditor,
} from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

describe("collection permissions", () => {
  beforeEach(() => {
    restore();
    cy.server();
  });

  describe("item management", () => {
    Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
      context(`${permission} access`, () => {
        userGroup.forEach(user => {
          onlyOn(permission === "curate", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.signIn(user);
              });

              describe("create dashboard", () => {
                it("should offer to save dashboard to a currently opened collection", () => {
                  cy.visit("/collection/root");
                  sidebar().within(() => {
                    cy.findByText("First collection").click();
                    cy.findByText("Second collection").click();
                  });
                  cy.icon("add").click();
                  cy.findByText("New dashboard").click();
                  cy.get(".AdminSelect").findByText("Second collection");
                });

                onlyOn(user === "admin", () => {
                  it("should offer to save dashboard to root collection from a dashboard page (metabase#16832)", () => {
                    cy.visit("/collection/root");
                    cy.findByText("Orders in a dashboard").click();
                    cy.icon("add").click();
                    popover()
                      .findByText("New dashboard")
                      .click();
                    cy.get(".AdminSelect").findByText("Our analytics");
                  });
                });
              });

              describe("pin", () => {
                it("pinning should work properly for both questions and dashboards", () => {
                  cy.visit("/collection/root");
                  // Assert that we're starting from a scenario with no pins
                  cy.findByTestId("pinned-items").should("not.exist");

                  pinItem("Orders in a dashboard"); // dashboard
                  pinItem("Orders, Count"); // question

                  // Should see "pinned items" and items should be in that section
                  cy.findByTestId("pinned-items").within(() => {
                    cy.findByText("Orders in a dashboard");
                    cy.findByText("Orders, Count");
                  });
                  // Only pinned dashboards should show up on the home page...
                  cy.visit("/");
                  cy.findByText("Orders in a dashboard");
                  cy.findByText("Orders, Count").should("not.exist");
                  // ...but not for the user without permissions to see the root collection
                  cy.signOut();
                  cy.signIn("none");
                  cy.visit("/");
                  cy.findByText("Orders in a dashboard").should("not.exist");
                });
              });

              describe("move", () => {
                it("should let a user move/undo move a question", () => {
                  move("Orders");
                });

                it("should let a user move/undo move a dashboard", () => {
                  move("Orders in a dashboard");
                });

                function move(item) {
                  cy.visit("/collection/root");
                  openEllipsisMenuFor(item);
                  cy.findByText("Move this item").click();
                  cy.get(".Modal").within(() => {
                    cy.findByText(`Move "${item}"?`);
                    // Let's move it into a nested collection
                    cy.findByText("First collection")
                      .siblings(".Icon-chevronright")
                      .click();
                    cy.findByText("Second collection").click();
                    cy.findByText("Move").click();
                  });
                  cy.findByText(item).should("not.exist");
                  // Make sure item was properly moved to a correct sub-collection
                  exposeChildrenFor("First collection");
                  cy.findByText("Second collection").click();
                  cy.findByText(item);
                  // Undo the whole thing
                  cy.findByText(/Moved (question|dashboard)/);
                  cy.findByText("Undo").click();
                  cy.findByText(item).should("not.exist");
                  cy.visit("/collection/root");
                  cy.findByText(item);
                }
              });

              describe("duplicate", () => {
                it("should be able to duplicate the dashboard without obstructions from the modal (metabase#15256)", () => {
                  duplicate("Orders in a dashboard");
                });

                it.skip("should be able to duplicate the question (metabase#15255)", () => {
                  duplicate("Orders");
                });

                function duplicate(item) {
                  cy.visit("/collection/root");
                  openEllipsisMenuFor(item);
                  cy.findByText("Duplicate this item").click();
                  cy.get(".Modal")
                    .as("modal")
                    .within(() => {
                      clickButton("Duplicate");
                      cy.findByText("Failed").should("not.exist");
                    });
                  cy.get("@modal").should("not.exist");
                  cy.findByText(`${item} - Duplicate`);
                }
              });

              describe("archive", () => {
                it("should be able to archive/unarchive question (metabase#15253)", () => {
                  archiveUnarchive("Orders");
                });

                it("should be able to archive/unarchive dashboard", () => {
                  archiveUnarchive("Orders in a dashboard");
                });

                describe("archive page", () => {
                  it("should show archived items (metabase#15080, metabase#16617)", () => {
                    cy.visit("collection/root");
                    openEllipsisMenuFor("Orders");
                    cy.findByText("Archive this item").click();
                    cy.findByText("Archived question")
                      .siblings(".Icon-close")
                      .click();
                    cy.findByText("View archive").click();
                    cy.location("pathname").should("eq", "/archive");
                    cy.findByText("Orders");
                  });
                });

                describe("collections", () => {
                  it("shouldn't be able to archive/edit root or personal collection", () => {
                    cy.visit("/collection/root");
                    cy.icon("edit").should("not.exist");
                    cy.findByText("Your personal collection").click();
                    cy.icon("edit").should("not.exist");
                  });

                  it("archiving sub-collection should redirect to its parent", () => {
                    cy.request("GET", "/api/collection").then(xhr => {
                      // We need to obtain the ID programatically
                      const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                        collection => collection.slug === "third_collection",
                      );
                      cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
                    });
                    cy.icon("pencil").click();
                    cy.findByText("Archive this collection").click();
                    cy.get(".Modal")
                      .findByText("Archive")
                      .click();
                    cy.get("[class*=PageHeading]")
                      .as("title")
                      .contains("Second collection");
                    sidebar().within(() => {
                      cy.findByText("First collection");
                      cy.findByText("Second collection");
                      cy.findByText("Third collection").should("not.exist");
                    });
                    // While we're here, we can test unarchiving the collection as well
                    cy.findByText("Archived collection");
                    cy.findByText("Undo").click();
                    cy.findByText(
                      "Sorry, you don’t have permission to see that.",
                    ).should("not.exist");
                    // We're still in the parent collection
                    cy.get("@title").contains("Second collection");
                    // But unarchived collection is now visible in the sidebar
                    sidebar().within(() => {
                      cy.findByText("Third collection");
                    });
                  });

                  it.skip("visiting already archived collection by its ID shouldn't let you edit it (metabase#12489)", () => {
                    cy.request("GET", "/api/collection").then(xhr => {
                      const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                        collection => collection.slug === "third_collection",
                      );
                      // Archive it
                      cy.request(
                        "PUT",
                        `/api/collection/${THIRD_COLLECTION_ID}`,
                        {
                          archived: true,
                        },
                      );

                      // What happens if we visit the archived collection by its id?
                      // This is the equivalent of hitting the back button but it also shows that the same UI is present whenever we visit the collection by its id
                      cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
                    });
                    cy.get("[class*=PageHeading]")
                      .as("title")
                      .contains("Third collection");
                    // Creating new sub-collection at this point shouldn't be possible
                    cy.icon("new_folder").should("not.exist");
                    // We shouldn't be able to change permissions for an archived collection (the root issue of #12489!)
                    cy.icon("lock").should("not.exist");
                    /**
                     *  We can take 2 routes from here - it will really depend on the design decision:
                     *    1. Edit icon shouldn't exist at all in which case some other call to action menu/button should exist
                     *       notifying the user that this collection is archived and prompting them to unarchive it
                     *    2. Edit icon stays but with "Unarchive this item" ONLY in the menu
                     */

                    // Option 1
                    cy.icon("edit").should("not.exist");

                    // Option 2
                    // cy.icon("edit").click();
                    // popover().within(() => {
                    //   cy.findByText("Edit this collection").should("not.exist");
                    //   cy.findByText("Archive this collection").should(
                    //     "not.exist",
                    //   );
                    //   cy.findByText("Unarchive this collection");
                    // });
                  });

                  it("abandoning archive process should keep you in the same collection (metabase#15289)", () => {
                    cy.request("GET", "/api/collection").then(xhr => {
                      const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                        collection => collection.slug === "third_collection",
                      );
                      cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
                      cy.icon("pencil").click();
                      cy.findByText("Archive this collection").click();
                      cy.get(".Modal")
                        .findByText("Cancel")
                        .click();
                      cy.location("pathname").should(
                        "eq",
                        `/collection/${THIRD_COLLECTION_ID}-third-collection`,
                      );
                      cy.get("[class*=PageHeading]")
                        .as("title")
                        .contains("Third collection");
                    });
                  });
                });

                function archiveUnarchive(item) {
                  cy.visit("/collection/root");
                  openEllipsisMenuFor(item);
                  cy.findByText("Archive this item").click();
                  cy.findByText(item).should("not.exist");
                  cy.findByText(/Archived (question|dashboard)/);
                  cy.findByText("Undo").click();
                  cy.findByText(
                    "Sorry, you don’t have permission to see that.",
                  ).should("not.exist");
                  cy.findByText(item);
                }
              });

              describe("managing question from the question's edit dropdown (metabase#11719)", () => {
                beforeEach(() => {
                  cy.route("PUT", "/api/card/1").as("updateQuestion");
                  cy.visit("/question/1");
                  cy.icon("pencil").click();
                });

                it("should be able to edit question details (metabase#11719-1)", () => {
                  cy.skipOn(user === "nodata");
                  cy.findByText("Edit this question").click();
                  cy.findByLabelText("Name")
                    .click()
                    .type("1");
                  clickButton("Save");
                  assertOnRequest("updateQuestion");
                  cy.findByText("Orders1");
                });

                it("should be able to move the question (metabase#11719-2)", () => {
                  cy.skipOn(user === "nodata");
                  cy.findByText("Move").click();
                  cy.findByText("My personal collection").click();
                  clickButton("Move");
                  assertOnRequest("updateQuestion");
                  cy.contains("37.65");
                });

                it("should be able to archive the question (metabase#11719-3, metabase#16512)", () => {
                  cy.intercept("GET", "/api/collection/root/items**").as(
                    "getItems",
                  );
                  cy.findByText("Archive").click();
                  clickButton("Archive");
                  assertOnRequest("updateQuestion");
                  cy.wait("@getItems"); // pinned items
                  cy.wait("@getItems"); // unpinned items
                  cy.location("pathname").should("eq", "/collection/root");
                  cy.findByText("Orders").should("not.exist");
                });

                it("should be able to add question to dashboard", () => {
                  popover()
                    .findByText("Add to dashboard")
                    .click();

                  cy.get(".Modal")
                    .as("modal")
                    .findByText("Orders in a dashboard")
                    .click();

                  cy.get("@modal").should("not.exist");
                  // By default, the dashboard contains one question
                  // After we add a new one, we check there are two questions now
                  cy.get(".DashCard").should("have.length", 2);
                });
              });

              describe("managing dashboard from the dashboard's edit menu", () => {
                beforeEach(() => {
                  cy.route("PUT", "/api/dashboard/1").as("updateDashboard");
                  cy.visit("/dashboard/1");
                  cy.icon("ellipsis").click();
                });

                it("should be able to change title and description", () => {
                  cy.findByText("Change title and description").click();
                  cy.location("pathname").should("eq", "/dashboard/1/details");
                  cy.findByLabelText("Name")
                    .click()
                    .type("1");
                  cy.findByLabelText("Description")
                    .click()
                    .type("Foo");
                  clickButton("Update");
                  assertOnRequest("updateDashboard");
                  cy.findByText("Orders in a dashboard1");
                  cy.icon("info").click();
                  cy.findByText("Foo");
                });

                it("should be able to duplicate a dashboard", () => {
                  cy.route("POST", "/api/dashboard/1/copy").as("copyDashboard");
                  cy.findByText("Duplicate").click();
                  cy.location("pathname").should("eq", "/dashboard/1/copy");
                  cy.get(".Modal").within(() => {
                    clickButton("Duplicate");
                    cy.findByText("Failed").should("not.exist");
                  });
                  assertOnRequest("copyDashboard");
                  cy.location("pathname").should(
                    "eq",
                    "/dashboard/2-orders-in-a-dashboard-duplicate",
                  );
                  cy.findByText(`Orders in a dashboard - Duplicate`);
                });

                describe("move", () => {
                  beforeEach(() => {
                    cy.findByText("Move").click();
                    cy.location("pathname").should("eq", "/dashboard/1/move");
                    cy.findByText("First collection").click();
                    clickButton("Move");
                  });

                  it("should be able to move/undo move a dashboard", () => {
                    assertOnRequest("updateDashboard");
                    // Why do we use "Dashboard moved to" here (without its location, btw) vs. "Moved dashboard" for the same action?
                    cy.findByText("Dashboard moved to");
                    cy.findByText("Undo").click();
                    assertOnRequest("updateDashboard");
                  });

                  it.skip("should update dashboard's collection after the move without page reload (metabase#13059)", () => {
                    cy.contains("37.65");
                    cy.get(".DashboardHeader a").contains("First collection");
                  });
                });

                it("should be able to archive/unarchive a dashboard", () => {
                  cy.findByText("Archive").click();
                  cy.location("pathname").should("eq", "/dashboard/1/archive");
                  cy.findByText("Archive this dashboard?"); //Without this, there is some race condition and the button click fails
                  clickButton("Archive");
                  assertOnRequest("updateDashboard");
                  cy.location("pathname").should("eq", "/collection/root");
                  cy.findByText("Orders in a dashboard").should("not.exist");
                  cy.findByText("Archived dashboard");
                  cy.findByText("Undo").click();
                  assertOnRequest("updateDashboard");
                });
              });
            });
          });

          onlyOn(permission === "view", () => {
            beforeEach(() => {
              cy.signIn(user);
            });

            it("should be offered to duplicate dashboard in collections they have `read` access to", () => {
              const { first_name, last_name } = USERS[user];
              cy.visit("/collection/root");
              openEllipsisMenuFor("Orders in a dashboard");
              popover()
                .findByText("Duplicate this item")
                .click();
              cy.get(".AdminSelect").findByText(
                `${first_name} ${last_name}'s Personal Collection`,
              );
            });

            ["/", "/collection/root"].forEach(route => {
              it("should not be offered to save dashboard in collections they have `read` access to (metabase#15281)", () => {
                const { first_name, last_name } = USERS[user];
                cy.visit(route);
                cy.icon("add").click();
                cy.findByText("New dashboard").click();

                // Coming from the root collection, the initial offered collection will be "Our analytics" (read-only access)
                cy.findByText(
                  `${first_name} ${last_name}'s Personal Collection`,
                ).click();
                popover().within(() => {
                  cy.findByText("My personal collection");
                  // Test will fail on this step first
                  cy.findByText("First collection").should("not.exist");
                  // This is the second step that makes sure not even search returns collections with read-only access
                  cy.icon("search").click();
                  cy.findByPlaceholderText("Search")
                    .click()
                    .type("third{Enter}");
                  cy.findByText("Third collection").should("not.exist");
                });
              });
            });

            describe("managing question from the question's edit dropdown", () => {
              it("should not be offered to add question to dashboard inside a collection they have `read` access to", () => {
                cy.visit("/question/1");
                cy.icon("pencil").click();
                popover()
                  .findByText("Add to dashboard")
                  .click();

                cy.get(".Modal").within(() => {
                  cy.findByText("Orders in a dashboard").should("not.exist");
                  cy.icon("search").click();
                  cy.findByPlaceholderText("Search").type(
                    "Orders in a dashboard{Enter}",
                  );
                  cy.findByText("Orders in a dashboard").should("not.exist");
                });
              });

              it("should offer personal collection as a save destination for a new dashboard", () => {
                const { first_name, last_name } = USERS[user];
                const personalCollection = `${first_name} ${last_name}'s Personal Collection`;
                cy.visit("/question/1");
                cy.icon("pencil").click();
                popover()
                  .findByText("Add to dashboard")
                  .click();

                cy.get(".Modal").within(() => {
                  cy.findByText("Create a new dashboard").click();
                  cy.get(".AdminSelect").findByText(personalCollection);
                  cy.findByLabelText("Name").type("Foo");
                  cy.button("Create").click();
                });
                cy.url().should("match", /\/dashboard\/\d+-foo$/);
                saveDashboard();
                cy.get(".DashboardHeader").findByText(personalCollection);
              });
            });

            describe("managing dashboard from the dashboard's edit menu", () => {
              it("should not be offered to change title and description for dashboard in collections they have `read` access to (metabase#15280)", () => {
                cy.visit("/dashboard/1");
                cy.icon("ellipsis").click();
                popover()
                  .findByText("Change title and description")
                  .should("not.exist");
              });

              it("should not be offered to archive dashboard in collections they have `read` access to (metabase#15280)", () => {
                cy.visit("/dashboard/1");
                cy.icon("ellipsis").click();
                popover()
                  .findByText("Archive")
                  .should("not.exist");
              });

              it("should be offered to duplicate dashboard in collections they have `read` access to", () => {
                const { first_name, last_name } = USERS[user];
                cy.visit("/dashboard/1");
                cy.icon("ellipsis").click();
                popover()
                  .findByText("Duplicate")
                  .click();
                cy.get(".AdminSelect").findByText(
                  `${first_name} ${last_name}'s Personal Collection`,
                );
              });
            });
          });
        });
      });
    });
  });

  describe("revision history", () => {
    beforeEach(() => {
      cy.route("POST", "/api/revision/revert").as("revert");
    });

    describe("reproductions", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
      });

      it("shouldn't render revision history steps when there was no diff (metabase#1926)", () => {
        cy.signInAsAdmin();
        cy.createDashboard("foo").then(({ body }) => {
          visitAndEditDashboard(body.id);
        });

        // Save the dashboard without any changes made to it (TODO: we should probably disable "Save" button in the first place)
        saveDashboard();
        cy.icon("pencil").click();
        saveDashboard();

        openRevisionHistory();

        cy.findByText("First revision.");

        cy.findAllByText("Revert").should("not.exist");
      });

      it.skip("dashboard should update properly on revert (metabase#6884)", () => {
        cy.signInAsAdmin();
        visitAndEditDashboard(1);
        // Add another question without changing its size or moving it afterwards
        cy.icon("add")
          .last()
          .click();
        cy.findByText("Orders, Count").click();
        saveDashboard();
        // Revert the card to the state when the second card was added
        cy.icon("ellipsis").click();
        cy.findByText("Revision history").click();
        clickRevert("added a card.", 0); // the top-most string or the latest card addition
        cy.wait("@revert");
        cy.request("GET", "/api/dashboard/1").then(xhr => {
          const SECOND_CARD = xhr.body.ordered_cards[1];
          const { col, sizeX, sizeY } = SECOND_CARD;
          // The second card shrunk its size and changed the position completely to the left covering the first one
          expect(col).not.to.eq(0);
          expect(sizeX).to.eq(4);
          expect(sizeY).to.eq(4);
        });
      });
    });

    Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
      context(`${permission} access`, () => {
        userGroup.forEach(user => {
          // This function `onlyOn` will not generate tests for any other condition.
          // It helps to make both our tests and Cypress runner sidebar clean
          onlyOn(permission === "curate", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.signInAsAdmin();
                // Generate some history for the question
                cy.request("PUT", "/api/card/1", {
                  name: "Orders renamed",
                });
                cy.signIn(user);
              });

              it("should be able to get to the dashboard revision modal directly via url", () => {
                cy.visit("/dashboard/1/history");
                cy.findByText("First revision.");
                cy.findAllByRole("button", { name: "Revert" });
              });

              it.skip("should be able to revert the dashboard (metabase#15237)", () => {
                cy.visit("/dashboard/1");
                cy.icon("ellipsis").click();
                cy.findByText("Revision history").click();
                clickRevert("First revision.");
                cy.wait("@revert").then(xhr => {
                  expect(xhr.status).to.eq(200);
                  expect(xhr.cause).not.to.exist;
                });
                cy.findAllByText(/Revert/).should("not.exist");
                // We reverted the dashboard to the state prior to adding any cards to it
                cy.findByText("This dashboard is looking empty.");
              });

              it("should be able to revert the question", () => {
                // It's possible that the mechanics of who should be able to revert the question will change (see https://github.com/metabase/metabase/issues/15131)
                // For now that's not possible for user without data access (likely it will be again when #11719 is fixed)
                cy.skipOn(user === "nodata");
                cy.visit("/question/1");
                cy.icon("pencil").click();
                cy.findByText("View revision history").click();
                clickRevert("First revision.");
                cy.wait("@revert").then(xhr => {
                  expect(xhr.status).to.eq(200);
                  expect(xhr.cause).not.to.exist;
                });
                cy.findAllByText(/Revert/).should("not.exist");
                // We need to reload the page because of #12581
                cy.reload();
                cy.contains(/^Orders$/);
              });
            });
          });

          onlyOn(permission === "view", () => {
            describe(`${user} user`, () => {
              it("should not see dashboard revert buttons (metabase#13229)", () => {
                cy.signIn(user);
                cy.visit("/dashboard/1");
                cy.icon("ellipsis").click();
                cy.findByText("Revision history").click();
                cy.findAllByRole("button", { name: "Revert" }).should(
                  "not.exist",
                );
              });

              it("should not see question revert buttons (metabase#13229)", () => {
                cy.signIn(user);
                cy.visit("/question/1");
                cy.icon("pencil").click();
                cy.findByText("View revision history").click();
                cy.findAllByRole("button", { name: "Revert" }).should(
                  "not.exist",
                );
              });
            });
          });
        });
      });
    });
  });

  it("should offer to save items to 'Our analytics' if user has a 'curate' access to it", () => {
    cy.signIn("normal");

    openNativeEditor().type("select * from people");
    cy.findByText("Save").click();

    cy.get(".AdminSelect").findByText("Our analytics");
  });
});

function clickRevert(event_name, index = 0) {
  cy.findAllByText(event_name)
    .eq(index)
    .closest("tr")
    .findByText(/Revert/i)
    .click();
}

function openEllipsisMenuFor(item, index = 0) {
  return cy
    .findAllByText(item)
    .eq(index)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

function clickButton(name) {
  cy.findByRole("button", { name })
    .should("not.be.disabled")
    .click();
}

function pinItem(item) {
  openEllipsisMenuFor(item);
  cy.findByText("Pin this item").click();
}

function exposeChildrenFor(collectionName) {
  cy.findByText(collectionName)
    .parent()
    .find(".Icon-chevronright")
    .eq(0) // there may be more nested icons, but we need the top level one
    .click();
}

function assertOnRequest(xhr_alias) {
  cy.wait("@" + xhr_alias).then(xhr => {
    expect(xhr.status).not.to.eq(403);
  });
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
  cy.get(".Modal").should("not.exist");
}

function visitAndEditDashboard(id) {
  cy.visit(`/dashboard/${id}`);
  cy.icon("pencil").click();
}

function saveDashboard() {
  clickButton("Save");
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

function openRevisionHistory() {
  cy.icon("ellipsis").click();
  cy.findByText("Revision history").click();
}
