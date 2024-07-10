import { onlyOn } from "@cypress/skip-test";

import { USERS } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  openNavigationSidebar,
  navigationSidebar,
  visitDashboard,
  modal,
  rightSidebar,
  appBar,
  getDashboardCard,
  undoToast,
  openDashboardMenu,
  toggleDashboardInfoSidebar,
  entityPickerModal,
  collectionOnTheGoModal,
} from "e2e/support/helpers";

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
    restore();
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

                visitDashboard(dashboard_id);
                assertOnRequest("getDashboard");
              });

              openDashboardMenu();
            });

            it("should be able to change title and description", () => {
              cy.findByTestId("dashboard-name-heading").type("1").blur();
              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              toggleDashboardInfoSidebar();

              rightSidebar()
                .findByPlaceholderText("Add description")
                .type("Foo")
                .blur();

              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              cy.reload();
              assertOnRequest("getDashboard");
              cy.findByDisplayValue(`${dashboardName}1`);
            });

            it("should shallow duplicate a dashboard but not its cards", () => {
              cy.get("@originalDashboardId").then(id => {
                cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
                  "copyDashboard",
                );

                const newDashboardName = `${dashboardName} - Duplicate`;
                const { name: originalQuestionName } = questionDetails;
                const newQuestionName = `${originalQuestionName} - Duplicate`;
                const newDashboardId = id + 1;

                popover().findByText("Duplicate").should("be.visible").click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.findByLabelText("Only duplicate the dashboard")
                    .as("shallowCopyCheckbox")
                    .should("not.be.checked")
                    .click();
                  cy.get("@shallowCopyCheckbox").should("be.checked");
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}"`,
                  });
                  cy.button("Duplicate").click();
                  assertOnRequest("copyDashboard");
                });

                cy.url().should("contain", `/dashboard/${newDashboardId}`);

                cy.findByDisplayValue(newDashboardName);
                appBar().findByText("Our analytics").click();

                cy.findAllByTestId("collection-entry-name")
                  .should("contain", dashboardName)
                  .and("contain", newDashboardName)
                  .and("contain", originalQuestionName)
                  .and("not.contain", newQuestionName);
              });
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

                popover().findByText("Duplicate").should("be.visible").click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.findByLabelText("Only duplicate the dashboard").should(
                    "not.be.checked",
                  );
                  cy.button("Duplicate").click();
                  assertOnRequest("copyDashboard");
                });

                cy.url().should("contain", `/dashboard/${newDashboardId}`);

                cy.findByDisplayValue(newDashboardName);
                appBar().findByText("Our analytics").click();

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

                popover().findByText("Duplicate").should("be.visible").click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.findByLabelText("Only duplicate the dashboard").should(
                    "not.be.checked",
                  );
                  cy.findByTestId("collection-picker-button").click();
                });

                if (user === "admin") {
                  // admin has recents tab
                  entityPickerModal()
                    .findByRole("tab", { name: /Collections/ })
                    .click();
                }

                entityPickerModal()
                  .findByText("Create a new collection")
                  .click();
                const NEW_COLLECTION = "Foo Collection";
                collectionOnTheGoModal().within(() => {
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
                appBar().findByText(NEW_COLLECTION).click();
                cy.findAllByTestId("collection-entry-name")
                  .should("contain", newDashboardName)
                  .and("contain", newQuestionName);

                openNavigationSidebar();
                navigationSidebar().findByText("Our analytics").click();
                cy.findAllByTestId("collection-entry-name")
                  .should("contain", dashboardName)
                  .and("contain", originalQuestionName);
              });
            });

            it("should be able to move/undo move a dashboard (metabase#13059, metabase#25705)", () => {
              cy.get("@originalDashboardId").then(id => {
                appBar().contains("Our analytics");

                popover().findByText("Move").click();
                cy.location("pathname").should("eq", `/dashboard/${id}/move`);

                entityPickerModal().within(() => {
                  cy.findByText("First collection").click();
                  cy.button("Move").click();
                });

                assertOnRequest("updateDashboard");
                getDashboardCard().contains("42");

                cy.log(
                  "it should update dashboard's collection after the move without the page reload (metabase#13059)",
                );
                appBar().contains("First collection");
                appBar().should("not.contain", "Our analytics");

                undoToast().within(() => {
                  cy.contains("Dashboard moved to First collection");
                  cy.button("Undo").click();
                });
                assertOnRequest("updateDashboard");

                appBar().contains("Our analytics");
                appBar().should("not.contain", "First collection");
              });
            });

            it("should be able to archive/unarchive a dashboard", () => {
              cy.get("@originalDashboardId").then(id => {
                popover().findByText("Archive").should("be.visible").click();

                cy.location("pathname").should(
                  "eq",
                  `/dashboard/${id}/archive`,
                );
                modal().within(() => {
                  cy.findByRole("heading", { name: "Archive this dashboard?" }); //Without this, there is some race condition and the button click fails
                  cy.button("Archive").click();
                  assertOnRequest("updateDashboard");
                });

                cy.location("pathname").should("eq", "/collection/root");
                cy.findAllByTestId("collection-entry-name").should(
                  "not.contain",
                  dashboardName,
                );
                undoToast().within(() => {
                  cy.findByText("Archived dashboard");
                  cy.button("Undo").click();
                  assertOnRequest("updateDashboard");
                });

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

            visitDashboard(ORDERS_DASHBOARD_ID);

            cy.get("main header").within(() => {
              cy.icon("ellipsis").should("be.visible").click();
            });
          });

          it("should not be offered to edit dashboard details or archive the dashboard for dashboard in collections they have `read` access to (metabase#15280)", () => {
            popover().findByText("Edit dashboard details").should("not.exist");

            popover().findByText("Archive").should("not.exist");
          });

          it("should be offered to duplicate dashboard in collections they have `read` access to", () => {
            const { first_name, last_name } = USERS[user];

            popover().findByText("Duplicate").click();
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
  modal().should("not.exist");
}
