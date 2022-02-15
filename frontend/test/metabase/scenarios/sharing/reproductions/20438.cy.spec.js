import { restore, filterWidget, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  name: "20438",
  native: {
    query: "SELECT * FROM PEOPLE\nWHERE true\n    [[AND {{NAME}}]]\n limit 300",
    "template-tags": {
      NAME: {
        id: "24f69111-29f8-135f-9321-1ff94bbb31ad",
        name: "NAME",
        "display-name": "Name",
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
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

    // Change filtering to the "List of all values"
    cy.request("PUT", `/api/field/${PEOPLE.NAME}`, {
      has_field_values: "list",
    });

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
              sizeX: 18,
              sizeY: 8,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["template-tag", "NAME"]],
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

        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );
  });

  it("dashboard filter connected to the field filter should work with a single value in embedded dashboards (metabase#20438)", () => {
    cy.icon("share").click();
    cy.findByText("Sharing and embedding").click();
    cy.findByText("Embed this dashboard in an application").click();

    cy.document().then(doc => {
      const iframe = doc.querySelector("iframe");
      cy.visit(iframe.src);
    });

    cy.wait("@getEmbed");

    filterWidget().click();
    cy.wait("@getEmbed");

    popover()
      .contains("Aaron Hand")
      .click();
    cy.wait("@getEmbed");

    cy.button("Add filter").click();
    cy.wait("@getEmbed");

    cy.get(".cellData")
      // The city where Aaron Hand lives
      .should("contain", "Hardy")
      // Some other city
      .and("not.contain", "Rye");
  });
});
