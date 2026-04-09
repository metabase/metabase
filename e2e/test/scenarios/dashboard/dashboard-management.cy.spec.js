import { onlyOn } from "@cypress/skip-test";

const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
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
    H.restore();
  });

  Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
    context(`${permission} access`, () => {
      userGroup.forEach((user) => {
        onlyOn(permission === "curate", () => {
          describe(`${user} user`, () => {
            beforeEach(() => {
              cy.signInAsAdmin();
              H.createNativeQuestionAndDashboard({
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

                H.visitDashboard(dashboard_id);
                assertOnRequest("getDashboard");
              });

              H.openDashboardMenu();
            });

            it("should be able to change title and description", () => {
              cy.findByTestId("dashboard-name-heading").type("1").blur();
              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              H.openDashboardInfoSidebar();

              H.sidesheet()
                .findByPlaceholderText("Add description")
                .type("Foo")
                .blur();
              H.closeDashboardInfoSidebar();

              assertOnRequest("updateDashboard");
              assertOnRequest("getDashboard");

              cy.reload();
              assertOnRequest("getDashboard");
              cy.findByDisplayValue(`${dashboardName}1`);
            });

            it("should shallow duplicate a dashboard but not its cards", () => {
              cy.get("@originalDashboardId").then((id) => {
                cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
                  "copyDashboard",
                );

                const newDashboardName = `${dashboardName} - Duplicate`;
                const { name: originalQuestionName } = questionDetails;
                const newQuestionName = `${originalQuestionName} - Duplicate`;
                const newDashboardId = id + 1;

                cy.log(
                  "add virtual card to check shallow copy checkbox plays nicely",
                );
                H.addTextBox("Foo bar baz");
                H.saveDashboard();
                H.openDashboardMenu();

                H.popover()
                  .findByText("Duplicate")
                  .should("be.visible")
                  .click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                H.modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.findByLabelText("Only duplicate the dashboard")
                    .as("shallowCopyCheckbox")
                    .should("not.be.checked")
                    .should("not.be.disabled")
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
                H.appBar().findByText("Our analytics").click();

                cy.findAllByTestId("collection-entry-name")
                  .should("contain", dashboardName)
                  .and("contain", newDashboardName)
                  .and("contain", originalQuestionName)
                  .and("not.contain", newQuestionName);
              });
            });

            it("should deep duplicate a dashboard and its cards", () => {
              cy.get("@originalDashboardId").then((id) => {
                cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
                  "copyDashboard",
                );
                const newDashboardName = `${dashboardName} - Duplicate`;
                const { name: originalQuestionName } = questionDetails;
                const newQuestionName = `${originalQuestionName} - Duplicate`;
                const newDashboardId = id + 1;

                H.popover()
                  .findByText("Duplicate")
                  .should("be.visible")
                  .click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                H.modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.findByLabelText("Only duplicate the dashboard").should(
                    "not.be.checked",
                  );
                  cy.icon("info").realHover();
                });

                H.tooltip().should(
                  "contain.text",
                  "If you check this, the cards in the duplicated dashboard will reference the original questions.",
                );

                H.modal().within(() => {
                  cy.button("Duplicate").click();
                  assertOnRequest("copyDashboard");
                });

                cy.url().should("contain", `/dashboard/${newDashboardId}`);

                cy.findByDisplayValue(newDashboardName);
                H.appBar().findByText("Our analytics").click();

                cy.findAllByTestId("collection-entry-name")
                  .should("contain", dashboardName)
                  .and("contain", newDashboardName)
                  .and("contain", originalQuestionName)
                  .and("contain", newQuestionName);
              });
            });

            it("should deep duplicate a dashboard and its cards to a collection created on the go", () => {
              cy.get("@originalDashboardId").then((id) => {
                cy.intercept("POST", `/api/dashboard/${id}/copy`).as(
                  "copyDashboard",
                );
                const newDashboardName = `${dashboardName} - Duplicate`;
                const { name: originalQuestionName } = questionDetails;
                const newQuestionName = originalQuestionName;
                const newDashboardId = id + 1;

                H.popover()
                  .findByText("Duplicate")
                  .should("be.visible")
                  .click();
                cy.location("pathname").should("eq", `/dashboard/${id}/copy`);

                H.modal().within(() => {
                  cy.findByRole("heading", {
                    name: `Duplicate "${dashboardName}" and its questions`,
                  });
                  cy.findByDisplayValue(newDashboardName);
                  cy.findByLabelText("Only duplicate the dashboard").should(
                    "not.be.checked",
                  );
                  cy.findByTestId("collection-picker-button").click();
                });

                H.entityPickerModal().findByText("New collection").click();
                const NEW_COLLECTION = "Foo Collection";
                H.collectionOnTheGoModal().within(() => {
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
                H.appBar().findByText(NEW_COLLECTION).click();
                cy.findAllByTestId("collection-entry-name")
                  .should("contain", newDashboardName)
                  .and("contain", newQuestionName);

                H.openNavigationSidebar();
                H.navigationSidebar().findByText("Our analytics").click();
                cy.findAllByTestId("collection-entry-name")
                  .should("contain", dashboardName)
                  .and("contain", originalQuestionName);
              });
            });

            it("should be able to move/undo move a dashboard (metabase#13059, metabase#25705)", () => {
              cy.get("@originalDashboardId").then((id) => {
                H.appBar().contains("Our analytics");

                H.popover().findByText("Move").click();
                cy.location("pathname").should("eq", `/dashboard/${id}/move`);

                H.entityPickerModal().within(() => {
                  cy.findByText("Our analytics").click();
                  cy.findByText("First collection").click();
                  cy.button("Move").click();
                });

                assertOnRequest("updateDashboard");
                H.getDashboardCard().contains("42");

                cy.log(
                  "it should update dashboard's collection after the move without the page reload (metabase#13059)",
                );
                H.appBar().contains("First collection");
                H.appBar().should("not.contain", "Our analytics");

                H.undoToast().within(() => {
                  cy.contains("Dashboard moved to First collection");
                  cy.button("Undo").click();
                });
                assertOnRequest("updateDashboard");

                H.appBar().contains("Our analytics");
                H.appBar().should("not.contain", "First collection");
              });
            });

            it("should be able to archive/unarchive a dashboard", () => {
              cy.get("@originalDashboardId").then((id) => {
                H.popover()
                  .findByText("Move to trash")
                  .should("be.visible")
                  .click();

                cy.location("pathname").should(
                  "eq",
                  `/dashboard/${id}/archive`,
                );
                H.modal().within(() => {
                  cy.findByRole("heading", {
                    name: "Move this dashboard to trash?",
                  }); //Without this, there is some race condition and the button click fails
                  cy.button("Move to trash").click();
                  assertOnRequest("updateDashboard");
                });

                cy.location("pathname").should("eq", `/dashboard/${id}`);

                cy.findByTestId("archive-banner").should("exist");

                H.undoToast().within(() => {
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

            H.visitDashboard(ORDERS_DASHBOARD_ID);

            cy.get("main header").within(() => {
              cy.icon("ellipsis").should("be.visible").click();
            });
          });

          it("should not be offered to edit dashboard details or archive the dashboard for dashboard in collections they have `read` access to (metabase#15280)", () => {
            H.popover()
              .findByText("Edit dashboard details")
              .should("not.exist");

            H.popover().findByText("Move to trash").should("not.exist");
          });

          it("should be offered to duplicate dashboard in collections they have `read` access to", () => {
            const { first_name, last_name } = USERS[user];

            H.popover().findByText("Duplicate").click();
            cy.findByTestId("collection-picker-button").should(
              "have.text",
              `${first_name} ${last_name}'s Personal Collection`,
            );
          });
        });
      });
    });
  });

  it("should be prevented from doing a shallow copy if the dashboard contains a dashboard question", () => {
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails: { name: dashboardName },
    }).then(({ body: { dashboard_id } }) => {
      H.createQuestion({
        name: "Foo dashboard question",
        query: { "source-table": SAMPLE_DATABASE.ORDERS_ID, limit: 5 },
        dashboard_id,
      }).then(({ body: card }) => {
        cy.wrap(card.id).as("dashboardQuestionId");
        H.addOrUpdateDashboardCard({ card_id: card.id, dashboard_id });
        H.visitDashboard(dashboard_id);
      });
    });

    H.openDashboardMenu();
    H.popover().findByText("Duplicate").should("be.visible").click();

    H.modal().within(() => {
      cy.findByRole("heading", {
        name: `Duplicate "${dashboardName}" and its questions`,
      });
      cy.findByLabelText("Only duplicate the dashboard").should("not.exist");
    });
  });
});

function assertOnRequest(xhr_alias) {
  cy.wait("@" + xhr_alias).then((xhr) => {
    expect(xhr.status).not.to.eq(403);
  });
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
  H.modal().should("not.exist");
}
