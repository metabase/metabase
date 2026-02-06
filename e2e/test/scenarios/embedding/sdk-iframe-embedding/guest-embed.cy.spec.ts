import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, getSignedJwtForResource } from "e2e/support/helpers";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { IS_ENTERPRISE } = Cypress.env();
const IS_OSS = !IS_ENTERPRISE;
const MB_EDITION = IS_ENTERPRISE ? "ee" : "oss";

describe(
  `scenarios > embedding > sdk iframe embedding > guest-embed > ${MB_EDITION}`,
  { ...(IS_OSS && { tags: "@OSS" }) },
  () => {
    beforeEach(() => {
      H.prepareGuestEmbedSdkIframeEmbedTest({
        onPrepare: () => {
          createQuestion({
            name: "47563",
            enable_embedding: true,
            embedding_type: "guest-embed",
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
              breakout: [["field", ORDERS.PRODUCT_ID, null]],
              limit: 2,
            },
          }).then(({ body: question }) => {
            cy.wrap(question.id).as("questionId");
          });
        },
      });
    });

    it("shows a static question", () => {
      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        const frame = H.loadSdkIframeEmbedTestPage({
          metabaseConfig: { isGuest: true },
          elements: [
            {
              component: "metabase-question",
              attributes: {
                token,
              },
            },
          ],
        });

        cy.wait("@getCardQuery");

        frame.within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });
      });
    });

    it("shows an error for a component without guest embed support", () => {
      const frame = H.loadSdkIframeEmbedTestPage({
        metabaseConfig: { isGuest: true },
        elements: [
          {
            component: "metabase-browser",
            attributes: {},
          },
        ],
      });

      frame.within(() => {
        cy.findByText("This component does not support guest embeds").should(
          "be.visible",
        );
      });
    });
  },
);

describe(
  `scenarios > embedding > sdk iframe embedding > guest-embed without token features > ${MB_EDITION}`,
  { ...(IS_OSS && { tags: "@OSS" }) },
  () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/embed/dashboard/**/card/*").as(
        "getEmbedDashCardQuery",
      );

      H.prepareGuestEmbedSdkIframeEmbedTest({
        withTokenFeatures: false,
        onPrepare: () => {
          // Create a dashboard with a question that has link columns
          H.createDashboardWithQuestions({
            dashboardName: "Dashboard with links",
            dashboardDetails: {
              enable_embedding: true,
              embedding_type: "guest-embed",
            },
            questions: [
              {
                name: "Question with link column",
                enable_embedding: true,
                embedding_type: "guest-embed",
                query: {
                  "source-table": ORDERS_ID,
                  expressions: {
                    "link url": [
                      "concat",
                      "https://example.org/order/",
                      ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
                    ],
                  },
                  fields: [
                    ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
                    ["expression", "link url", { "base-type": "type/Text" }],
                  ],
                  limit: 5,
                },
                visualization_settings: {
                  column_settings: {
                    '["name","ID"]': {
                      view_as: "link",
                      link_text: "Order {{ID}}",
                      link_url: "https://example.org/order/{{ID}}",
                    },
                  },
                },
              },
            ],
            cards: [{ size_x: 24, size_y: 6, col: 0, row: 0 }],
          }).then(({ dashboard }) => {
            cy.wrap(dashboard.id).as("linkDashboardId");
          });
        },
      });
    });

    it("handleLink plugin is not called without embedding_simple token feature", function () {
      cy.get("@linkDashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        const frame = H.loadSdkIframeEmbedTestPage({
          metabaseConfig: { isGuest: true },
          elements: [
            {
              component: "metabase-dashboard",
              attributes: { token },
            },
          ],
          insertHtml: {
            afterEmbed: `
              <script>
                window.handleLinkCalls = [];
                window.metabaseConfig.pluginsConfig = {
                  handleLink: (url) => {
                    window.handleLinkCalls.push(url);
                    return { handled: true };
                  },
                };
              </script>
            `,
          },
        });

        cy.wait("@getEmbedDashCardQuery");

        frame.within(() => {
          cy.findByText("Order 448").click();
        });

        // Without the embedding_simple token feature, handleLink should NOT be called
        // because bridgeHandleLinkForEmbedJs returns { handled: false } in OSS
        cy.window().its("handleLinkCalls").should("have.length", 0);
      });
    });
  },
);
