import { onlyOn } from "@cypress/skip-test";
import {
  restore,
  popover,
  visitDashboard,
  modal,
  rightSidebar,
} from "__support__/e2e/helpers";

import { USERS } from "__support__/e2e/cypress_data";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

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
              cy.intercept("PUT", "/api/dashboard/1").as("updateDashboard");

              cy.signIn(user);
              visitDashboard(1);
              cy.get("main header").within(() => {
                cy.icon("ellipsis").click();
              });
            });

            it("should be able to change title and description", () => {
              cy.findByTestId("dashboard-name-heading")
                .click()
                .type("1")
                .blur();
              assertOnRequest("updateDashboard");

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

              cy.reload();
              cy.findByDisplayValue("Orders in a dashboard1");
            });

            it("should be able to duplicate a dashboard", () => {
              cy.intercept("POST", "/api/dashboard/1/copy").as("copyDashboard");

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
                popover().within(() => {
                  cy.findByText("Move").click();
                });
                cy.location("pathname").should("eq", "/dashboard/1/move");
                modal().within(() => {
                  cy.findByText("First collection").click();
                  clickButton("Move");
                });
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
              popover().within(() => {
                cy.findByText("Archive").click();
              });
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
