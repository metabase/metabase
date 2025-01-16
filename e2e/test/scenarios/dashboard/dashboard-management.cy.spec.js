import { onlyOn } from "@cypress/skip-test";

import { USERS } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

const questionDetails = {
  name: "Q1",
  native: { query: "SELECT  '42' as ANSWER" },
  display: "scalar",
};

const dashboardName = "FooBar";

describe("managing dashboard from the dashboard's edit menu", () => {
  beforeEach(() => {
    cy.restore();
  });

  Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
    context(`${permission} access`, () => {
      userGroup.forEach(user => {
        onlyOn(permission === "curate", () => {
          describe(`${user} user`, () => {
            beforeEach(() => {
              cy.signInAsAdmin();
              cy.createNativeQuestionAndDashboard({
                questionDetails,
                dashboardDetails: { name: dashboardName },
              }).then(({ body: { dashboard_id } }) => {
                cy.wrap(dashboard_id).as("originalDashboardId");
                cy.intercept("GET", `/api/dashboard/${dashboard_id}*`).as(
                  "getDashboard",
                );
                cy.intercept("PUT", `/api/dashboard/${dashboard_id}`).as(
                  "updateDashboard",
                );

                cy.signIn(user);

                cy.visitDashboard(dashboard_id);
                assertOnRequest("getDashboard");
              });

              cy.openDashboardMenu();
            });

            it("should be able to change title and description", () => {
              cy.findByTestId("dashboard-name-heading").type("1").blur();
              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              cy.openDashboardInfoSidebar();

              cy.sidesheet()
                .findByPlaceholderText("Add description")
                .type("Foo")
                .blur();
              cy.closeDashboardInfoSidebar();

              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              cy.reload();
              assertOnRequest("getDashboard");
              cy.findByDisplayValue(`${dashboardName}1`);
            });

            it("should deep duplicate a dashboard and its cards", () => {
              cy.get("@originalDashboardId").then(id => {
                cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
                  "copyDashboard",
                );
                const newDashboardName = `${dashboardName} - Duplicate`;
                const { name: originalQuestionName } = questionDetails;
                const newQuestionName = `${originalQuestionName} - Duplicate`;
                const newDashboardId = id + 1;

                cy.popover()
                  .findByText("Duplicate")
                  .should("be.visible")
                  .click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                cy.modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.button("Duplicate").click();
                  assertOnRequest("copyDashboard");
                });

                cy.url().should("contain", `/dashboard/${newDashboardId}`);

                cy.findByDisplayValue(newDashboardName);
                cy.appBar().findByText("Our analytics").click();

                cy.findAllByTestId("collection-entry-name")
                  .should("contain", dashboardName)
                  .and("contain", newDashboardName)
                  .and("contain", originalQuestionName)
                  .and("contain", newQuestionName);
              });
            });

            it("should deep duplicate a dashboard and its cards to a collection created on the go", () => {
              cy.get("@originalDashboardId").then(id => {
                cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
                  "copyDashboard",
                );
                const newDashboardName = `${dashboardName} - Duplicate`;
                const { name: originalQuestionName } = questionDetails;
                const newQuestionName = originalQuestionName;
                const newDashboardId = id + 1;

                cy.popover()
                  .findByText("Duplicate")
                  .should("be.visible")
                  .click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                cy.modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.findByTestId("collection-picker-button").click();
                });

                if (user === "admin") {
                  // admin has recents tab
                  cy.entityPickerModal()
                    .findByRole("tab", { name: /Collections/ })
                    .click();
                }

                cy.entityPickerModal().findByText("New collection").click();
                const NEW_COLLECTION = "Foo Collection";
                cy.collectionOnTheGoModal().within(() => {
                  cy.findByPlaceholderText("My new collection").type(
                    NEW_COLLECTION,
                  );
                  cy.button("Create").click();
                });
                cy.button("Select").click();
                cy.button("Duplicate").click();
                assertOnRequest("copyDashboard");

                cy.url().should("contain", `/dashboard/${newDashboardId}`);

                cy.findByDisplayValue(newDashboardName);
                cy.appBar().findByText(NEW_COLLECTION).click();
                cy.findAllByTestId("collection-entry-name")
                  .should("contain", newDashboardName)
                  .and("contain", newQuestionName);

                cy.openNavigationSidebar();
                cy.navigationSidebar().findByText("Our analytics").click();
                cy.findAllByTestId("collection-entry-name")
                  .should("contain", dashboardName)
                  .and("contain", originalQuestionName);
              });
            });

            it("should be able to move/undo move a dashboard (metabase#13059, metabase#25705)", () => {
              cy.get("@originalDashboardId").then(id => {
                cy.appBar().contains("Our analytics");

                cy.popover().findByText("Move").click();
                cy.location("pathname").should("eq", `/dashboard/${id}/move`);

                cy.entityPickerModal().within(() => {
                  cy.findByText("First collection").click();
                  cy.button("Move").click();
                });

                assertOnRequest("updateDashboard");
                cy.getDashboardCard().contains("42");

                cy.log(
                  "it should update dashboard's collection after the move without the page reload (metabase#13059)",
                );
                cy.appBar().contains("First collection");
                cy.appBar().should("not.contain", "Our analytics");

                cy.undoToast().within(() => {
                  cy.contains("Dashboard moved to First collection");
                  cy.button("Undo").click();
                });
                assertOnRequest("updateDashboard");

                cy.appBar().contains("Our analytics");
                cy.appBar().should("not.contain", "First collection");
              });
            });

            it("should be able to archive/unarchive a dashboard", () => {
              cy.get("@originalDashboardId").then(id => {
                cy.popover()
                  .findByText("Move to trash")
                  .should("be.visible")
                  .click();

                cy.location("pathname").should(
                  "eq",
                  `/dashboard/${id}/archive`,
                );
                cy.modal().within(() => {
                  cy.findByRole("heading", {
                    name: "Move this dashboard to trash?",
                  }); //Without this, there is some race condition and the button click fails
                  cy.button("Move to trash").click();
                  assertOnRequest("updateDashboard");
                });

                cy.location("pathname").should("eq", `/dashboard/${id}`);

                cy.findByTestId("archive-banner").should("exist");

                cy.undoToast().within(() => {
                  cy.findByText("FooBar has been moved to the trash.");
                  cy.button("Undo").click();
                  assertOnRequest("updateDashboard");
                });

                cy.visit("/collection/root");
                cy.findAllByTestId("collection-entry-name").should(
                  "contain",
                  dashboardName,
                );
              });
            });
          });
        });

        onlyOn(permission === "view", () => {
          beforeEach(() => {
            cy.signIn(user);

            cy.visitDashboard(ORDERS_DASHBOARD_ID);

            cy.get("main header").within(() => {
              cy.icon("ellipsis").should("be.visible").click();
            });
          });

          it("should not be offered to edit dashboard details or archive the dashboard for dashboard in collections they have `read` access to (metabase#15280)", () => {
            cy.popover()
              .findByText("Edit dashboard details")
              .should("not.exist");

            cy.popover().findByText("Move to trash").should("not.exist");
          });

          it("should be offered to duplicate dashboard in collections they have `read` access to", () => {
            const { first_name, last_name } = USERS[user];

            cy.popover().findByText("Duplicate").click();
            cy.findByTestId("collection-picker-button").should(
              "have.text",
              `${first_name} ${last_name}'s Personal Collection`,
            );
          });
        });
      });
    });
  });
});

function assertOnRequest(xhr_alias) {
  cy.wait("@" + xhr_alias).then(xhr => {
    expect(xhr.status).not.to.eq(403);
  });
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
  cy.modal().should("not.exist");
}
