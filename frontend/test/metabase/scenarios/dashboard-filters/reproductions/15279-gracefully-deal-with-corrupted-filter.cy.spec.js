import { restore, filterWidget } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

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

  it("filters should work even if one of them is corrupted (metabase #15279)", () => {
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

        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );

    // Check that list filter works
    filterWidget()
      .contains("List")
      .click();

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

    cy.findByText("Gold Beach");
    cy.findByText("Arcadia").should("not.exist");

    // The corrupted filter is now present in the UI, but it doesn't work (as expected)
    // People can now easily remove it
    cy.findByPlaceholderText("Enter a value...");
  });
});
