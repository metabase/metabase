import { onlyOn } from "@cypress/skip-test";
import {
  restore,
  popover,
  visitDashboard,
  modal,
  rightSidebar,
  appBar,
  getDashboardCard,
  undoToast,
  openDashboardMenu,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";

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
              cy.signIn(user);

              cy.createNativeQuestionAndDashboard({
                questionDetails,
                dashboardDetails: { name: dashboardName },
              }).then(({ body: { dashboard_id } }) => {
                cy.wrap(dashboard_id).as("originalDashboardId");
                cy.intercept("GET", `/api/dashboard/${dashboard_id}`).as(
                  "getDashboard",
                );
                cy.intercept("PUT", `/api/dashboard/${dashboard_id}`).as(
                  "updateDashboard",
                );
                visitDashboard(dashboard_id);
                assertOnRequest("getDashboard");
              });

              openDashboardMenu();
            });

            it("should be able to change title and description", () => {
              cy.findByTestId("dashboard-name-heading")
                .click()
                .type("1")
                .blur();
              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              cy.get("main header").within(() => {
                cy.icon("info").click();
              });

              rightSidebar().within(() => {
                cy.findByPlaceholderText("Add description")
                  .click()
                  .type("Foo")
                  .blur();
              });

              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              cy.reload();
              assertOnRequest("getDashboard");
              cy.findByDisplayValue("Orders in a dashboard1");
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

            it("should be able to move/undo move a dashboard (metabase#13059)", () => {
              appBar().contains("Our analytics");

              popover().findByText("Move").click();
              cy.location("pathname").should("eq", "/dashboard/1/move");

              modal().within(() => {
                cy.findByText("First collection").click();
                clickButton("Move");
              });

              assertOnRequest("updateDashboard");
              getDashboardCard().contains("37.65");

              cy.log(
                "it should update dashboard's collection after the move without the page reload (metabase#, metabase#25705)",
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

            it("should be able to archive/unarchive a dashboard", () => {
              popover().within(() => {
                cy.findByText("Archive").click();
              });
              cy.location("pathname").should("eq", "/dashboard/1/archive");
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Archive this dashboard?"); //Without this, there is some race condition and the button click fails
              clickButton("Archive");
              assertOnRequest("updateDashboard");
              cy.location("pathname").should("eq", "/collection/root");
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Orders in a dashboard").should("not.exist");
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Archived dashboard");
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Undo").click();
              assertOnRequest("updateDashboard");
            });
          });
        });

        onlyOn(permission === "view", () => {
          beforeEach(() => {
            cy.signIn(user);

            visitDashboard(1);

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
            cy.findByTestId("select-button").findByText(
              `${first_name} ${last_name}'s Personal Collection`,
            );
          });
        });
      });
    });
  });
});

function clickButton(name) {
  cy.findByRole("button", { name }).should("not.be.disabled").click();
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
