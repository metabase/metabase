import { restore, filterWidget, visitDashboard } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const firstFilter = {
  name: "List",
  slug: "list",
  id: "6fe14171",
  type: "category",
};

const secondFilter = {
  name: "Search",
  slug: "search",
  id: "4db4913a",
  type: "category",
};

// This filter is corrupted because it's missing `name` and `slug`
const corruptedFilter = {
  name: "",
  slug: "",
  id: "af72ce9c",
  type: "category",
};

const parameters = [firstFilter, secondFilter, corruptedFilter];

const questionDetails = {
  name: "15279",
  query: { "source-table": PEOPLE_ID },
};

describe("issue 15279", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("a corrupted parameter filter should still appear in the UI (metabase #15279)", () => {
    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Add filters to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters,
        });

        // Connect filters to that question
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              sizeX: 18,
              sizeY: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: firstFilter.id,
                  card_id,
                  target: ["dimension", ["field-id", PEOPLE.SOURCE]],
                },
                {
                  parameter_id: secondFilter.id,
                  card_id,
                  target: ["dimension", ["field-id", PEOPLE.NAME]],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );

    cy.intercept("GET", "/api/dashboard/*/params/*/values").as("values");

    // Check that list filter works
    filterWidget()
      .contains("List")
      .click();

    cy.wait("@values");
    cy.findByTextEnsureVisible("Add filter");

    cy.findByPlaceholderText("Enter some text")
      .type("Organic")
      .blur();
    cy.button("Add filter").click();

    // Check that the search filter works
    filterWidget()
      .contains("Search")
      .click();
    cy.findByPlaceholderText("Search by Name").type("Lora Cronin");
    cy.button("Add filter").click();

    // The corrupted filter is now present in the UI, but it doesn't work (as expected)
    // People can now easily remove it
    cy.findByPlaceholderText("Enter a value...");
  });
});
