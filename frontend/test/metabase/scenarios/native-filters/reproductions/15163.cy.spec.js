import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";
import { USER_GROUPS } from "__support__/e2e/cypress_data";

const { PRODUCTS } = SAMPLE_DATASET;
const { COLLECTION_GROUP } = USER_GROUPS;

const nativeFilter = {
  id: "dd7f3e66-b659-7d1c-87b3-ab627317581c",
  name: "cat",
  "display-name": "Cat",
  type: "dimension",
  dimension: ["field-id", PRODUCTS.CATEGORY],
  "widget-type": "category",
  default: null,
};

const nativeQuery = {
  name: "15163",
  native: {
    query: 'SELECT COUNT(*) FROM "PRODUCTS" WHERE {{cat}}',
    "template-tags": {
      cat: nativeFilter,
    },
  },
};

const dashboardFilter = {
  name: "Category",
  slug: "category",
  id: "fd723065",
  type: "category",
};

["nodata+nosql", "nosql"].forEach(test => {
  describe.skip("issue 14302", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      restore();
      cy.signInAsAdmin();

      cy.createNativeQuestion(nativeQuery).then(({ body: { id: card_id } }) => {
        cy.createDashboard("15163D").then(({ body: { id: dashboard_id } }) => {
          cy.addFilterToDashboard({ filter: dashboardFilter, dashboard_id });

          // Add previously created question to the dashboard
          cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
            cardId: card_id,
          }).then(({ body: { id } }) => {
            // Connect filter to that question
            cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
              cards: [
                {
                  id,
                  card_id,
                  row: 0,
                  col: 0,
                  sizeX: 10,
                  sizeY: 8,
                  series: [],
                  visualization_settings: {
                    "card.title": "New Title",
                  },
                  parameter_mappings: [
                    {
                      parameter_id: dashboardFilter.id,
                      card_id,
                      target: ["dimension", ["template-tag", "cat"]],
                    },
                  ],
                },
              ],
            });
          });

          if (test === "nosql") {
            cy.updatePermissionsGraph({
              [COLLECTION_GROUP]: {
                "1": { schemas: "all", native: "none" },
              },
            });
          }

          cy.signIn("nodata");

          // Visit dashboard and set the filter through URL
          cy.visit(`/dashboard/${dashboard_id}?category=Gizmo`);
        });
      });
    });

    it(`${test.toUpperCase()} version:\n should be able to view SQL question when accessing via dashboard with filters connected to modified card without SQL permissions (metabase#15163)`, () => {
      cy.findByText("New Title").click();

      cy.wait("@dataset", { timeout: 5000 }).then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      cy.get(".ace_content").should("not.exist");
      cy.findByText("Showing 1 row");
    });
  });
});
