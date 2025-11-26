import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, getSignedJwtForResource } from "e2e/support/helpers";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const isOss = Cypress.env("MB_EDITION") === "oss";

describe(
  `scenarios > embedding > sdk iframe embedding > guest-embed > ${isOss ? "OSS" : "EE"}`,
  { ...(isOss && { tags: "@OSS" }) },
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
          metabaseConfig: { isGuestEmbed: true },
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
  },
);
