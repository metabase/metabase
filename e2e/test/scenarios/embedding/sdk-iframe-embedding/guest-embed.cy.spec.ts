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
