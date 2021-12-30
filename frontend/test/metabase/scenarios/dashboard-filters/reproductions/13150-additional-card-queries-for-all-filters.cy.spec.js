import { restore, expectedRouteCalls } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const questionDetails = {
  name: "13150 (Products)",
  query: { "source-table": PRODUCTS_ID },
};

const parameters = [
  { name: "Title", slug: "title", id: "9f20a0d5", type: "category" },
  {
    name: "Category",
    slug: "category",
    id: "719fe1c2",
    type: "category",
  },
  { name: "Vendor", slug: "vendor", id: "a73b7c9", type: "category" },
];

const [titleFilter, categoryFilter, vendorFilter] = parameters;

describe("issue 13150", () => {
  beforeEach(() => {
    cy.server();
    cy.route("POST", "/api/dashboard/*/card/*/query").as("cardQuery");

    restore();
    cy.signInAsAdmin();
  });

  it("should not send additional card queries for all filters (metabase#13150)", () => {
    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.log("Add 3 filters to the dashboard");
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters,
        });

        cy.log("Add previously created qeustion to the dashboard");

        cy.log("Connect all filters to the card");
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              sizeX: 14,
              sizeY: 12,
              parameter_mappings: [
                {
                  parameter_id: titleFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                },
                {
                  parameter_id: categoryFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
                {
                  parameter_id: vendorFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.VENDOR, null]],
                },
              ],
              visualization_settings: {},
            },
          ],
        });

        cy.visit(
          `/dashboard/${dashboard_id}?title=Awesome Concrete Shoes&category=Widget&vendor=McClure-Lockman`,
        );
      },
    );

    cy.wait("@cardQuery");
    expectedRouteCalls({ route_alias: "cardQuery", calls: 1 });
  });
});
