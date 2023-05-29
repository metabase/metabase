import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { USER_GROUPS } from "e2e/support/cypress_data";

const { PRODUCTS } = SAMPLE_DATABASE;
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

const dashboardDetails = {
  parameters: [dashboardFilter],
};

["nodata+nosql", "nosql"].forEach(test => {
  describe("issue 15163", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      restore();
      cy.signInAsAdmin();

      cy.createNativeQuestionAndDashboard({
        questionDetails: nativeQuery,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        // Connect filter to the dashboard card
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 13,
              size_y: 11,
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

        if (test === "nosql") {
          cy.updatePermissionsGraph({
            [COLLECTION_GROUP]: {
              1: { data: { schemas: "all", native: "none" } },
            },
          });
        }

        cy.signIn("nodata");

        // Visit dashboard and set the filter through URL
        cy.visit(`/dashboard/${dashboard_id}?category=Gizmo`);
      });
    });

    it(`${test.toUpperCase()} version:\n should be able to view SQL question when accessing via dashboard with filters connected to modified card without SQL permissions (metabase#15163)`, () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New Title").click();

      cy.wait("@cardQuery", { timeout: 5000 }).then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      cy.get(".ace_content").should("not.be.visible");
      cy.get(".cellData").should("contain", "51");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 1 row");
    });
  });
});
