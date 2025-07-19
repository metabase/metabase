import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { getNewEmbedScript } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

export const getIframeContent = () => {
  return cy
    .get("iframe")
    .should("be.visible")
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty");
};

describe("scenarios > embedding > sdk iframe embedding > custom elements api", () => {
  beforeEach(() => {
    cy.signInAsAdmin();
    H.prepareSdkIframeEmbedTest({
      withTokenFeatures: true,
    });
  });

  describe("dashboard", () => {
    it("should load a <metabase-dashboard dashboard-id='${number}'>", () => {
      H.visitCustomHtmlPage(`
      ${getNewEmbedScript()}

      <script>
        const { defineMetabaseConfig } = window["metabase.embed"];
        defineMetabaseConfig({
          instanceUrl: "http://localhost:4000",
        });
      </script>

      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />
      `);

      getIframeContent().should("contain", "Orders in a dashboard");
    });

    it("should allow setting initial parameters and hidden parameters", () => {
      const DASHBOARD_PARAMETERS = [
        { name: "ID", slug: "id", id: "11111111", type: "id" },
        { name: "Product ID", slug: "product_id", id: "22222222", type: "id" },
      ];

      H.createQuestionAndDashboard({
        questionDetails: {
          name: "Orders table",
          query: { "source-table": ORDERS_ID },
        },
        dashboardDetails: {
          name: "Dashboard with Parameters",
          parameters: DASHBOARD_PARAMETERS,
        },
      }).then(({ body: card }) => {
        H.editDashboardCard(card, {
          parameter_mappings: DASHBOARD_PARAMETERS.map((parameter) => ({
            card_id: card.card_id,
            parameter_id: parameter.id,
            target: ["dimension", ["field", ORDERS.ID, null]],
          })),
        }).then(() => {
          const dashboardId = card.dashboard_id;

          H.visitCustomHtmlPage(`
          ${getNewEmbedScript()}

          <script>
            const { defineMetabaseConfig } = window["metabase.embed"];
            defineMetabaseConfig({
              instanceUrl: "http://localhost:4000",
            });
          </script>

          <metabase-dashboard dashboard-id="${dashboardId}" initial-parameters='{"id": "123"}' hidden-parameters='["product_id"]' />
          `);

          getIframeContent()
            .findByTestId("dashboard-parameters-widget-container")
            .within(() => {
              cy.findByLabelText("ID").should("contain", "123");
              cy.findByLabelText("Product ID").should("not.exist");
            });

          // make sure the filter is applied
          getIframeContent().findByText("1 row").should("exist");
        });
      });
    });
  });
});
