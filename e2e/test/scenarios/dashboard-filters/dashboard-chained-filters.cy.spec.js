import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  showDashboardCardActions,
  visitDashboard,
  addOrUpdateDashboardCard,
  getDashboardCard,
  resetTestTable,
  resyncDatabase,
} from "e2e/support/helpers";

const { PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > dashboard > chained filter", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  for (const has_field_values of ["search", "list"]) {
    it(`limit ${has_field_values} options based on linked filter`, () => {
      cy.request("PUT", `/api/field/${PEOPLE.CITY}`, { has_field_values }),
        visitDashboard(ORDERS_DASHBOARD_ID);
      // start editing
      cy.icon("pencil").click();

      // add a state filter
      cy.icon("filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("Is").click();
      });

      // connect that to people.state
      getDashboardCard().within(() => {
        cy.findByText("Column to filter on");
        cy.findByText("Select…").click();
      });

      popover().within(() => {
        cy.findByText("State").click();
      });

      // open the linked filters tab, and click the click to add a City filter
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Linked filters").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("add another dashboard filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("Is").click();
      });

      // connect that to person.city
      getDashboardCard().within(() => {
        cy.findByText("Column to filter on");
        cy.findByText("Select…").click();
      });
      popover().within(() => {
        cy.findByText("City").click();
      });

      // Link city to state
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Limit this filter's choices")
        .parent()
        .within(() => {
          // turn on the toggle
          cy.findByText("Location")
            .parent()
            .within(() => {
              cy.get("input").click();
            });

          // open up the list of linked columns
          cy.findByText("Location").click();
          // It's hard to assert on the "table.column" pairs.
          // We just assert that the headers are there to know that something appeared.
          cy.findByText("Filtering column");
          cy.findByText("Filtered column");
        });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You're editing this dashboard.").should("not.exist");

      // now test that it worked!
      // Select Alaska as a state. We should see Anchorage as a option but not Anacoco
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("Add filter").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.findByPlaceholderText(
          has_field_values === "search" ? "Search by City" : "Search the list",
        ).type("An");
        cy.findByText("Anchorage");
        cy.findByText("Anacoco").should("not.exist");

        cy.get("input").first().clear();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("AK").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("GA").click();

        cy.findByText("Update filter").click();
      });

      // do it again to make sure it isn't cached incorrectly
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.get("input").first().type("An");
        cy.findByText("Canton");
        cy.findByText("Anchorage").should("not.exist");
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("GA").click();
      popover().within(() => {
        cy.findByText("GA").click();
        cy.findByText("Update filter").click();
      });

      // do it again without a state filter to make sure it isn't cached incorrectly
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.get("input").first().type("An");
        cy.findByText("Adrian");
        cy.findByText("Anchorage");
        cy.findByText("Canton");
      });
    });
  }

  it(
    "should work for all field types (metabase#15170)",
    { tags: "@external" },

    () => {
      const dialect = "postgres";
      const TEST_TABLE = "many_data_types";

      resetTestTable({ type: dialect, table: TEST_TABLE });
      restore(`${dialect}-writable`);
      cy.signInAsAdmin();
      resyncDatabase({ tableName: TEST_TABLE, tableAlias: "testTable" });

      cy.get("@testTable").then(testTable => {
        const testTableId = testTable.id;
        const uuidFieldId = testTable.fields.find(
          field => field.name === "uuid",
        ).id;
        const idFieldId = testTable.fields.find(
          field => field.name === "id",
        ).id;

        cy.wrap(testTableId).as("testTableId");
        cy.wrap(uuidFieldId).as("uuidFieldId");

        cy.log(
          "Mimics that UUID is the table's primary key, so we could map dashboard ID parameter to UUID",
        );
        cy.request("PUT", `/api/field/${idFieldId}`, {
          semantic_type: null,
        });

        cy.request("PUT", `/api/field/${uuidFieldId}`, {
          semantic_type: "type/PK",
        });
      });

      cy.then(function () {
        const TEST_TABLE_ID = this.testTableId;
        const UUID_FIELD_ID = this.uuidFieldId;

        cy.createQuestion({
          name: "15170",
          database: WRITABLE_DB_ID,
          query: { "source-table": TEST_TABLE_ID },
        }).then(({ body: { id: QUESTION_ID } }) => {
          cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
            // Add filter to the dashboard
            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
              parameters: [
                {
                  id: "50c9eac6",
                  name: "ID",
                  slug: "id",
                  type: "id",
                },
              ],
            });

            // Add previously created question to the dashboard
            addOrUpdateDashboardCard({
              card_id: QUESTION_ID,
              dashboard_id: DASHBOARD_ID,
            }).then(({ body: { id: DASH_CARD_ID } }) => {
              // Connect filter to that question
              cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
                dashcards: [
                  {
                    id: DASH_CARD_ID,
                    card_id: QUESTION_ID,
                    row: 0,
                    col: 0,
                    size_x: 11,
                    size_y: 6,
                    parameter_mappings: [
                      {
                        parameter_id: "50c9eac6",
                        card_id: QUESTION_ID,
                        target: ["dimension", ["field-id", UUID_FIELD_ID]],
                      },
                    ],
                  },
                ],
              });
            });

            visitDashboard(DASHBOARD_ID);
            cy.icon("pencil").click();
            showDashboardCardActions();
            getDashboardCard().icon("click").click();
            cy.findByText("UUID").click();
            cy.findByText("Update a dashboard filter").click();
            cy.findByText("Available filters")
              .parent()
              .findByText("ID")
              .click();
            popover().findByText("UUID").should("be.visible");
          });
        });
      });
    },
  );
});
