import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, getSignedJwtForResource } from "e2e/support/helpers";
import { uploadTranslationDictionaryViaAPI } from "e2e/support/helpers/e2e-content-translation-helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountGuestEmbedQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";
import type { Card } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > guest-embed-content-translations", () => {
  describe("question", () => {
    const setup = ({ display }: { display?: Card["display"] } = {}) => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "pro-cloud",
      });

      createQuestion({
        name: "Question for Guest Embed SDK",
        enable_embedding: true,
        embedding_type: "guest-embed",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
          breakout: [["field", ORDERS.PRODUCT_ID, null]],
          limit: 2,
        },
        display,
      }).then(({ body: question }) => {
        cy.wrap(question.id).as("questionId");
      });

      cy.signOut();
    };

    describe("content translation", () => {
      it("should show question content with applied content translation", () => {
        setup();

        cy.signInAsAdmin();

        uploadTranslationDictionaryViaAPI([
          {
            locale: "de",
            msgid: "Question for Guest Embed SDK",
            msgstr: "Override title für Deutsch",
          },
          {
            locale: "de",
            msgid: "Product ID",
            msgstr: "Override Product ID für Deutsch",
          },
        ]);

        cy.signOut();

        cy.get("@questionId").then(async (questionId) => {
          const token = await getSignedJwtForResource({
            resourceId: questionId as unknown as number,
            resourceType: "question",
          });

          mountGuestEmbedQuestion(
            { token, title: true },
            {
              sdkProviderProps: {
                locale: "de",
              },
            },
          );

          getSdkRoot().within(() => {
            cy.findByText("Override title für Deutsch").should("be.visible");
            cy.findByText("Override Product ID für Deutsch").should(
              "be.visible",
            );
          });
        });
      });
    });
  });
});
