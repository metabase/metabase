import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

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
      ${H.getNewEmbedScriptTag()}

      ${H.getNewEmbedConfigurationScript({})}

      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />
      `);

      H.getSimpleEmbedIframeContent().should(
        "contain",
        "Orders in a dashboard",
      );
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
          ${H.getNewEmbedScriptTag()}
          ${H.getNewEmbedConfigurationScript({})}

          <metabase-dashboard dashboard-id="${dashboardId}" initial-parameters='{"id": "123"}' hidden-parameters='["product_id"]' />
          `);

          H.getSimpleEmbedIframeContent()
            .findByTestId("dashboard-parameters-widget-container")
            .within(() => {
              cy.findByLabelText("ID").should("contain", "123");
              cy.findByLabelText("Product ID").should("not.exist");
            });

          // make sure the filter is applied
          H.getSimpleEmbedIframeContent().findByText("1 row").should("exist");
        });
      });
    });

    it("should respect the theme passed to the configuration function", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}

      ${H.getNewEmbedConfigurationScript({
        theme: { colors: { brand: "#123456" } },
      })}

      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("User ID")
        // the color is applied via rgb, not via hex
        .should("have.css", "color", "rgb(18, 52, 86)");
    });

    it("should show title when with-title is passed with no value", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("Orders in a dashboard")
        .should("be.visible");
    });

    it("should show title when with-title is 'true'", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title="true" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("Orders in a dashboard")
        .should("be.visible");
    });

    it("should hide title when with-title is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-title="false" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("Orders in a dashboard")
        .should("not.exist");
    });

    it("should show download button when with-downloads is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-downloads />
      `);

      H.getSimpleEmbedIframeContent()
        .findByLabelText("Download as PDF")
        .should("be.visible");
    });

    it("should hide download button when with-downloads is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" with-downloads="false" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByLabelText("Download as PDF")
        .should("not.exist");
    });

    it("should enable drill-through when drills is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" drills />
      `);

      H.getSimpleEmbedIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      H.getSimpleEmbedIframeContent()
        .findByText(/Filter by this value/)
        .should("be.visible");
    });

    it("should disable drill-through when drills is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" drills="false" />
      `);

      H.getSimpleEmbedIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      H.getSimpleEmbedIframeContent()
        .findByText(/Filter by this value/)
        .should("not.exist");
    });
  });

  describe("<metabase-question>", () => {
    it("should embed a question with <metabase-question question-id='${number}'>", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}

      ${H.getNewEmbedConfigurationScript()}

      <metabase-question question-id="${ORDERS_QUESTION_ID}" />
      `);

      H.getSimpleEmbedIframeContent(0).findByText("Orders").should("exist");
    });

    it("should allow rendering two different questions in the same page", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}

      <div style="display: flex; flex-direction: row; gap: 10px;">
        <div>
          <p>Question ${ORDERS_QUESTION_ID}</p>
          <metabase-question question-id="${ORDERS_QUESTION_ID}" />
        </div>
        <div>
          <p>Question ${ORDERS_COUNT_QUESTION_ID}</p>
          <metabase-question question-id="${ORDERS_COUNT_QUESTION_ID}" />
        </div>
      </div>
      `);

      H.waitForSimpleEmbedIframesToLoad(2);

      H.getSimpleEmbedIframeContent(0)
        .findByText("Orders")
        .should("exist", { timeout: 10000 });
      H.getSimpleEmbedIframeContent(1)
        .findByText("Orders, Count")
        .should("exist", { timeout: 10000 });
    });

    it("should show title when with-title is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-title />
      `);

      H.getSimpleEmbedIframeContent().findByText("Orders").should("be.visible");
    });

    it("should hide title when with-title is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-title="false" />
      `);

      H.getSimpleEmbedIframeContent().findByText("Orders").should("not.exist");
    });

    it("should show download button when with-downloads is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-downloads />
      `);

      H.getSimpleEmbedIframeContent()
        .findByLabelText("download icon")
        .should("be.visible");
    });

    it("should hide download button when with-downloads is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" with-downloads="false" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByLabelText("download icon")
        .should("not.exist");
    });

    it("should enable drill-through when drills is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" drills />
      `);

      H.getSimpleEmbedIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      H.getSimpleEmbedIframeContent()
        .findByText(/Filter by this value/)
        .should("be.visible");
    });

    it("should disable drill-through when drills is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" drills="false" />
      `);

      H.getSimpleEmbedIframeContent()
        .findAllByText("37.65")
        .first()
        .should("be.visible")
        .click();
      H.getSimpleEmbedIframeContent()
        .findByText(/Filter by this value/)
        .should("not.exist");
    });
  });

  describe("common checks", () => {
    describe("should be permissive with json attributes", () => {
      // NOTE: pay attention if you use initialFilters for these tests, as when the filters are not parsed correctly
      // we default them to the latest filters used by that user
      it("should support normal json with strings wrapped in double quotes", () => {
        H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="new" entity-types='["table"]' />
      `);

        H.getSimpleEmbedIframeContent().should("contain", "Orders");
        H.getSimpleEmbedIframeContent().should("not.contain", "Orders model");
      });

      it("should support json5 with strings wrapped in single quotes", () => {
        H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="new" entity-types='["table"]' />
      `);

        H.getSimpleEmbedIframeContent().should("contain", "Orders");
        H.getSimpleEmbedIframeContent().should("not.contain", "Orders model");
      });
    });
  });

  describe("sync vs async vs defer script loading", () => {
    (
      [
        {
          loadType: "sync",
        },
        {
          loadType: "async",
        },
        {
          loadType: "defer",
        },
      ] as const
    ).forEach(({ loadType }) => {
      it(`should work correctly when the script is loaded ${loadType}`, () => {
        H.visitCustomHtmlPage(`
          ${H.getNewEmbedScriptTag({ loadType })}
          ${H.getNewEmbedConfigurationScript({
            theme: { colors: { brand: "#FF0000" } },
          })}
          <metabase-dashboard dashboard-id="${ORDERS_DASHBOARD_ID}" />

          <button onclick="defineMetabaseConfig({ theme: { colors: { brand: '#00FF00' } } })">Change theme</button>
        `);

        cy.log("Check if the dashboard is loaded");
        H.getSimpleEmbedIframeContent().should(
          "contain",
          "Orders in a dashboard",
        );

        cy.log("Check that the initial theme is applied");

        H.getSimpleEmbedIframeContent()
          .findByText("User ID")
          .should("have.css", "color", "rgb(255, 0, 0)");

        cy.log(
          "Check that calling defineMetabaseConfig after the initial load works",
        );
        // eslint-disable-next-line no-unscoped-text-selectors -- this is not the real app
        cy.findByText("Change theme").click();

        H.getSimpleEmbedIframeContent()
          .findByText("User ID")
          .should("have.css", "color", "rgb(0, 255, 0)");
      });
    });
  });
});
