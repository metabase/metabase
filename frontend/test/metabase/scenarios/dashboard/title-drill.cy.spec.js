import { restore, filterWidget } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

describe("scenarios > dashboard > title drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should let you click through the title to the query builder (metabase#13042)", () => {
    const questionDetails = {
      name: "Q1",
      native: { query: 'SELECT 1 as "foo", 2 as "bar"' },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["foo"],
        "graph.metrics": ["bar"],
      },
    };

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );

    // wait for qustion to load
    cy.findByText("foo");

    // drill through title
    cy.findByText("Q1").click();

    // check that we're in the QB now
    cy.findByText("This question is written in SQL.");

    cy.findByText("foo");
    cy.findByText("bar");
  });

  it("'contains' filter should still work after title drill through IF the native question field filter's type matches exactly (metabase#16181)", () => {
    const filter = {
      name: "Text contains",
      slug: "text_contains",
      id: "98289b9b",
      type: "string/contains",
      sectionId: "string",
    };

    const questionDetails = {
      name: "16181",
      native: {
        query: "select count(*) from products where {{filter}}",
        "template-tags": {
          filter: {
            id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
            name: "filter",
            "display-name": "Filter",
            type: "dimension",
            dimension: ["field", PRODUCTS.TITLE, null],
            "widget-type": "string/contains",
            default: null,
          },
        },
      },
      display: "scalar",
    };

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.addFilterToDashboard({ filter, dashboard_id });

        // Connect filter to the card
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              sizeX: 8,
              sizeY: 6,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["template-tag", "filter"]],
                },
              ],
            },
          ],
        });

        cy.visit(`/dashboard/${dashboard_id}`);
        checkScalarResult("200");
      },
    );

    cy.findByText("Text contains").click();
    cy.findByPlaceholderText("Enter some text")
      .type("bb")
      .blur();
    cy.button("Add filter").click();

    checkFilterLabelAndValue("Text contains", "bb");
    checkScalarResult("12");

    // Drill through on the quesiton's title
    cy.findByText("16181").click();

    checkFilterLabelAndValue("Filter", "bb");
    checkScalarResult("12");
  });
});

function checkFilterLabelAndValue(label, value) {
  filterWidget()
    .find("legend")
    .invoke("text")
    .should("eq", label);
  filterWidget().contains(value);
}

function checkScalarResult(result) {
  cy.get(".ScalarValue")
    .invoke("text")
    .should("eq", result);
}
