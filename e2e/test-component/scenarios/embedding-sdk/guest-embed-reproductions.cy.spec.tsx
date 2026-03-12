import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  downloadAndAssert,
  getSignedJwtForResource,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountGuestEmbedQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";
import type { Card } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > guest-embed reproductions", () => {
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

  it("should show question content with applied content translation", () => {
    setup();

    cy.get("@questionId").then(async (questionId) => {
      const token = await getSignedJwtForResource({
        resourceId: questionId as unknown as number,
        resourceType: "question",
      });

      mountGuestEmbedQuestion({ token, title: true, withDownloads: true });

      cy.window().then((win) => {
        const url = new URL(win.location.href);

        url.searchParams.set("foo", "bar");
        win.history.replaceState(null, "", url);
      });

      getSdkRoot().within(() => {
        downloadAndAssert({
          isDashboard: false,
          isEmbed: true,
          enableFormatting: true,
          assertStatusCode: 200,
          waitForDismiss: false,
          fileType: "csv",
          downloadUrl: "/api/embed/card/*/query/csv*",
          downloadMethod: "GET",
        });
      });
    });
  });
});
