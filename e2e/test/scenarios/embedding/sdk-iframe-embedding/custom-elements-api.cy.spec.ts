import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > custom elements api", () => {
  beforeEach(() => {
    cy.signInAsAdmin();
    H.prepareSdkIframeEmbedTest({
      withToken: "bleeding-edge",
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

    it("should allow saving a question when `is-save-enabled` is true", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="new" is-save-enabled />
      `);

      H.getSimpleEmbedIframeContent().findByText("Orders").click();
      H.getSimpleEmbedIframeContent().findByText("Save").should("be.visible");
    });

    it("should not allow saving a question when `is-save-enabled` is false", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-question question-id="new" is-save-enabled="false" />
      `);

      H.getSimpleEmbedIframeContent().findByText("Orders").click();
      H.getSimpleEmbedIframeContent().findByText("Save").should("not.exist");
    });

    it("should set initial sql parameters with `initial-sql-parameters`", () => {
      H.createNativeQuestion({
        name: "SQL question with parameter",
        native: {
          query: "select * from orders where id = {{id}}",
          "template-tags": {
            id: {
              id: "6b8b10ef-0104-1047-1e5v-2701dfc64356",
              name: "id",
              "display-name": "ID",
              type: "number",
              required: true,
            },
          },
        },
      }).then(({ body: { id: questionId } }) => {
        H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript()}
        <metabase-question question-id="${questionId}" initial-sql-parameters='{"id": 123}' />
        `);

        H.getSimpleEmbedIframeContent()
          .findByTestId("query-visualization-root")
          .findByText("123")
          .should("be.visible");
      });
    });

    it("should save a new question to a target collection when `target-collection` is set", () => {
      cy.log("Create a new collection to save the question to");

      H.visitCustomHtmlPage(`
          ${H.getNewEmbedScriptTag()}
          ${H.getNewEmbedConfigurationScript()}
          <metabase-question question-id="new" drills="false" is-save-enabled target-collection="${THIRD_COLLECTION_ID}" />
        `);

      cy.intercept("POST", "/api/card").as("createCard");

      cy.log("Create a new question and save it");
      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByText("Orders").click();
        cy.findByText("Save").click();

        cy.findByRole("dialog").within(() => {
          cy.findByText("Where do you want to save this?").should("not.exist");

          cy.findByRole("button", { name: "Save" }).click();
        });

        cy.wait("@createCard").then(({ response }) => {
          expect(response?.body.collection_id).to.equal(THIRD_COLLECTION_ID);
        });
      });
    });
  });

  describe("<metabase-metabot>", () => {
    it("should load the embedded Metabot component", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-metabot />
      `);

      H.getSimpleEmbedIframeContent().within(() => {
        cy.log("metabot chat should be interactive");
        cy.findByText("Ask questions to AI.").should("be.visible");
        cy.findByPlaceholderText("Ask AI a question...").type("Foo{enter}");
        cy.findByText(
          "Metabot is currently offline. Please try again later.",
        ).should("be.visible");

        cy.log(
          "uses sidebar layout by default when no layout attribute is provided",
        );
        cy.findByTestId("metabot-question-container").should(
          "have.attr",
          "data-layout",
          "sidebar",
        );

        cy.log("should show disclaimer text in sidebar layout");
        cy.findAllByText("AI isn't perfect. Double-check results.").should(
          "be.visible",
        );
      });
    });

    it("should apply the data-layout attribute when layout is set to stacked", () => {
      H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript()}
      <metabase-metabot layout="stacked" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByTestId("metabot-question-container")
        .should("have.attr", "data-layout", "stacked");

      cy.log("should show disclaimer text in stacked layout");
      H.getSimpleEmbedIframeContent()
        .findAllByText("AI isn't perfect. Double-check results.")
        .should("be.visible");
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
      <metabase-question question-id="new" entity-types="['table']" />
      `);

        H.getSimpleEmbedIframeContent().should("contain", "Orders");
        H.getSimpleEmbedIframeContent().should("not.contain", "Orders model");
      });
    });

    it("should not define color-scheme meta tag on embeds (metabase#65533)", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript()}
        <metabase-question question-id="new" />
      `);

      H.waitForSimpleEmbedIframesToLoad();

      cy.get("iframe[data-metabase-embed]")
        .its("0.contentDocument")
        .within(() => {
          cy.log("a generic meta tag should exist");
          cy.get("meta[name='viewport']").should("exist");

          cy.log("the color-scheme tag should not exist on EAJS embeds");
          cy.get("meta[name='color-scheme']").should("not.exist");
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
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- this is not the real app
        cy.findByText("Change theme").click();

        H.getSimpleEmbedIframeContent()
          .findByText("User ID")
          .should("have.css", "color", "rgb(0, 255, 0)");
      });
    });
  });
});
