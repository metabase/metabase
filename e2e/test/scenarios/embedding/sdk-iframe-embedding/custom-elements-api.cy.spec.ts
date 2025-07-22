import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const getIframeContent = () => {
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

  describe("<metabase-dashboard>", () => {
    it("should embed a dashboard with <metabase-dashboard dashboard-id='${number}'>", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}

      ${H.getNewEmbedConfigurationScript({})}

      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />
      `);

      getIframeContent().should("contain", "Orders in a dashboard");
    });

    it("should allow setting initial parameters and hidden parameters via `initial-parameters` and `hidden-parameters` attributes", () => {
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
          ${H.getNewEmbedScript()}
          ${H.getNewEmbedConfigurationScript({})}

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

    it("should respect the theme passed to the configuration function", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}

      ${H.getNewEmbedConfigurationScript({
        theme: { colors: { brand: "#123456" } },
      })}

      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />
      `);

      getIframeContent()
        .findByText("User ID")
        // the color is applied via rgb, not via hex
        .should("have.css", "color", "rgb(18, 52, 86)");
    });

    it("should show title when with-title is passed with no value", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title />
      `);

      getIframeContent()
        .findByText("Orders in a dashboard")
        .should("be.visible");
    });

    it("should show title when with-title is 'true'", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title="true" />
      `);

      getIframeContent()
        .findByText("Orders in a dashboard")
        .should("be.visible");
    });

    it("should hide title when with-title is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title="false" />
      `);

      getIframeContent()
        .findByText("Orders in a dashboard")
        .should("not.exist");
    });

    it("should show download button when with-downloads is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-downloads />
      `);

      getIframeContent()
        .findByLabelText("Download as PDF")
        .should("be.visible");
    });

    it("should hide download button when with-downloads is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-downloads="false" />
      `);

      getIframeContent().findByLabelText("Download as PDF").should("not.exist");
    });

    it("should enable drill-through when is-drill-through-enabled is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" is-drill-through-enabled />
      `);

      getIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      getIframeContent()
        .findByText(/Filter by this value/)
        .should("be.visible");
    });

    it("should disable drill-through when is-drill-through-enabled is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" is-drill-through-enabled="false" />
      `);

      getIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      getIframeContent()
        .findByText(/Filter by this value/)
        .should("not.exist");
    });
  });

  describe("<metabase-question>", () => {
    it("should embed a question with <metabase-question question-id='${number}'>", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}

      ${H.getNewEmbedConfigurationScript()}

      <metabase-question question-id="${ORDERS_QUESTION_ID}" />
      `);

      getIframeContent().findByText("Orders").should("exist");
      getIframeContent().findByText("User ID").should("exist");
    });

    it("should show title when with-title is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-title />
      `);

      getIframeContent().findByText("Orders").should("be.visible");
    });

    it("should hide title when with-title is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-title="false" />
      `);

      getIframeContent().findByText("Orders").should("not.exist");
    });

    it("should show download button when with-downloads is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-downloads />
      `);

      getIframeContent().findByLabelText("download icon").should("be.visible");
    });

    it("should hide download button when with-downloads is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-downloads="false" />
      `);

      getIframeContent().findByLabelText("download icon").should("not.exist");
    });

    it("should enable drill-through when is-drill-through-enabled is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" is-drill-through-enabled />
      `);

      getIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      getIframeContent()
        .findByText(/Filter by this value/)
        .should("be.visible");
    });

    it("should disable drill-through when is-drill-through-enabled is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScript()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" is-drill-through-enabled="false" />
      `);

      getIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      getIframeContent()
        .findByText(/Filter by this value/)
        .should("not.exist");
    });
  });
});
