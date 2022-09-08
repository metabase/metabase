import {
  restore,
  filterWidget,
  popover,
  visitDashboard,
  visitIframe,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "20438",
  native: {
    query:
      "SELECT * FROM PRODUCTS\nWHERE true\n    [[AND {{CATEGORY}}]]\n limit 30",
    "template-tags": {
      CATEGORY: {
        id: "24f69111-29f8-135f-9321-1ff94bbb31ad",
        name: "CATEGORY",
        "display-name": "Category",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/=",
        default: null,
      },
    },
  },
};

const filter = {
  name: "Text",
  slug: "text",
  id: "b555d25b",
  type: "string/=",
  sectionId: "string",
};

describe("issue 20438", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/embed/dashboard/**").as("getEmbed");

    restore();
    cy.signInAsAdmin();

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
              size_x: 18,
              size_y: 8,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["template-tag", "CATEGORY"]],
                },
              ],
            },
          ],
        });

        // Enable embedding and enable the "Text" filter
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          enable_embedding: true,
          embedding_params: { [filter.slug]: "enabled" },
        });

        visitDashboard(dashboard_id);
      },
    );
  });

  it("dashboard filter connected to the field filter should work with a single value in embedded dashboards (metabase#20438)", () => {
    cy.icon("share").click();
    cy.findByText("Embed this dashboard in an application").click();

    visitIframe();

    cy.wait("@getEmbed");

    filterWidget().click();
    cy.wait("@getEmbed");

    popover().contains("Doohickey").click();
    cy.wait("@getEmbed");

    cy.button("Add filter").click();
    cy.wait("@getEmbed");

    cy.findAllByTestId("cell-data")
      // One of product titles for Doohickey
      .should("contain", "Small Marble Shoes")
      // One of product titles for Gizmo
      .and("not.contain", "Rustic Paper Wallet");
  });
});
