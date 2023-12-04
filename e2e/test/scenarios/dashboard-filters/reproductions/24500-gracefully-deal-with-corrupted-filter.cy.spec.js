import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  filterWidget,
  visitDashboard,
  popover,
  editDashboard,
  saveDashboard,
} from "e2e/support/helpers";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const listFilter = {
  name: "List",
  slug: "list",
  id: "6fe14171",
  type: "string/=",
  sectionId: "string",
};

const searchFilter = {
  name: "Search",
  slug: "search",
  id: "4db4913a",
  type: "string/=",
  sectionId: "string",
};

// This filter is corrupted because it's missing `name` and `slug`
const corruptedFilter = {
  name: "",
  slug: "",
  id: "af72ce9c",
  type: "string/=",
  sectionId: "string",
};

const parameters = [listFilter, searchFilter, corruptedFilter];

const questionDetails = {
  name: "15279",
  query: { "source-table": PEOPLE_ID },
};

const dashboardDetails = { parameters };

describe("issues 15279 and 24500", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("corrupted dashboard filter should still appear in the UI without breaking other filters (metabase#15279, metabase#24500)", () => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Connect filters to the question
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: listFilter.id,
                  card_id,
                  target: ["dimension", ["field", PEOPLE.SOURCE, null]],
                },
                {
                  parameter_id: searchFilter.id,
                  card_id,
                  target: ["dimension", ["field", PEOPLE.NAME, null]],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );
    cy.wait("@dashcardQuery");
    cy.findByTestId("dashcard").findByText("15279");

    cy.intercept("GET", "/api/dashboard/*/params/*/values").as("values");

    // Check that list filter works
    filterWidget().contains("List").click();
    cy.wait("@values");

    cy.findByPlaceholderText("Search the list").type("Or").blur();
    popover().contains("Organic").click();
    cy.button("Add filter").click();

    cy.get(".DashCard")
      .should("contain", "Lora Cronin")
      .and("contain", "Dagmar Fay");

    // Check that the search filter works
    filterWidget().contains("Search").click();
    cy.findByPlaceholderText("Search by Name").type("Lora Cronin");
    cy.button("Add filter").click();

    cy.get(".DashCard")
      .should("contain", "Lora Cronin")
      .and("not.contain", "Dagmar Fay");

    // The corrupted filter is now present in the UI, but it doesn't work (as expected)
    // People can now easily remove it
    editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("unnamed")
      .icon("gear")
      .click();
    cy.findByRole("button", { name: "Remove" }).click();
    saveDashboard();

    // Check the list filter again
    filterWidget().contains("List").click();
    cy.wait("@values");

    // Check that the search filter works
    filterWidget().contains("Search").click();
    cy.findByPlaceholderText("Search by Name").type("Lora Cronin");
    cy.button("Add filter").click();

    cy.get(".DashCard")
      .should("contain", "Lora Cronin")
      .and("not.contain", "Dagmar Fay");
  });
});
