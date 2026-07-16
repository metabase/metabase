import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

describe(
  "scenarios > embedding > sdk iframe embedding > custom visualizations",
  { tags: "@EE" },
  () => {
    beforeEach(() => {
      H.prepareSdkIframeEmbedTest({ withToken: "bleeding-edge" });

      cy.log("Turn on the prereqs for custom visualizations");
      cy.request("PUT", "/api/setting", {
        "csp-img-enabled": true, // csp-img is required to enable custom-viz
        "custom-viz-enabled": true,
      });

      cy.log("Upload the demo-viz custom visualization plugin");
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);

      cy.log("Create a question that targets the demo-viz custom display");
      // demo-viz expects exactly one row with one numeric column.
      H.createQuestion({
        name: "Custom Viz EAJS Question",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
        display: H.CUSTOM_VIZ_DISPLAY,
      }).then(({ body: question }) => {
        cy.wrap(question.id).as("questionId");
      });
    });

    it("renders the custom visualization when allowedCustomVisualizations includes the display", () => {
      cy.log(
        "EAJS has no eval-permissive page CSP, so the plugin sandbox goes through the signed donor endpoint pair",
      );
      cy.intercept(
        "POST",
        "**/api/ee/custom-viz-plugin/sandbox-host-eajs/sign",
      ).as("mintSandboxHostEajs");
      cy.intercept("GET", "**/api/ee/custom-viz-plugin/sandbox-host-eajs*").as(
        "getSandboxHostEajs",
      );

      cy.get<CardId>("@questionId").then((questionId) => {
        const frame = H.loadSdkIframeEmbedTestPage({
          elements: [
            {
              component: "metabase-question",
              attributes: { questionId },
            },
          ],
          metabaseConfig: {
            allowedCustomVisualizations: [H.CUSTOM_VIZ_DISPLAY],
          },
        });

        cy.wait("@getCardQuery");

        cy.log("The sandbox mints a signed URL, then loads the donor with it");
        cy.wait("@mintSandboxHostEajs");
        cy.wait("@getSandboxHostEajs")
          .its("request.url")
          .should("include", "/sandbox-host-eajs?token=");

        frame.within(() => {
          cy.findByText("Custom viz rendered successfully").should(
            "be.visible",
          );
        });
      });
    });

    it("falls back to the default display when the allowlist is not set", () => {
      cy.get<CardId>("@questionId").then((questionId) => {
        const frame = H.loadSdkIframeEmbedTestPage({
          elements: [
            {
              component: "metabase-question",
              attributes: { questionId },
            },
          ],
        });

        cy.wait("@getCardQuery");

        frame.within(() => {
          cy.findByText("Custom viz rendered successfully").should("not.exist");
          // The count question renders with its sensible default (a scalar)
          // when the custom viz is not allowlisted.
          cy.findByTestId("scalar-container").should("be.visible");
        });
      });
    });
  },
);
