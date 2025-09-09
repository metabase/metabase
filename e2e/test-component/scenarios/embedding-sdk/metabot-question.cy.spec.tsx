const { H } = cy;

import { MetabotQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const metabot_id = "c61bf5f5-1025-47b6-9298-bf1827105bb6";
const query = {
  "source-table": ORDERS_ID,
  aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
  breakout: [["field", ORDERS.PRODUCT_ID, null]],
  limit: 2,
};
const adHocQuestionPath = `/question#${btoa(
  JSON.stringify({
    dataset_query: { database: 1, type: "query", query },
    display: "table",
    displayIsLocked: true,
    visualization_settings: {},
  }),
)}`;

const metabotResponse = `0:"Here is the [question link](${adHocQuestionPath})"`;
const metabotResponseWithNavigateTo = `${metabotResponse}
2:{"type":"navigate_to","version":1,"value":"${adHocQuestionPath}"}`;

const metabotRetryResponse = `0:"Retry: Here is the [question link](${adHocQuestionPath})"`;

describe("scenarios > embedding-sdk > metabot-question", () => {
  const setup = (response: string) => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.mockMetabotResponse({
      statusCode: 200,
      body: response,
    });

    H.createQuestion({
      name: "1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
      cy.wrap(question.entity_id).as("questionEntityId");
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  };

  it("should automatically show the ad-hoc question for the last agent message containing ad-hoc question link", () => {
    setup(metabotResponseWithNavigateTo);

    mountSdkContent(<MetabotQuestion />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-chat-input").type("Show orders {enter}");

      cy.findByTestId("visualization-root").should("exist");
    });
  });

  it("should show the ad-hoc question when clicking its link", () => {
    setup(metabotResponse);

    mountSdkContent(<MetabotQuestion />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-chat-input").type("Show orders {enter}");

      cy.findAllByTestId("metabot-chat-message")
        .should("have.length", 2)
        .last()
        .findByText("question link")
        .click();

      cy.findByTestId("visualization-root").should("exist");
    });
  });

  it("should retry a message when clicking the retry button", () => {
    setup(metabotResponse);

    mountSdkContent(<MetabotQuestion />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-chat-input").type("Show orders {enter}");

      H.mockMetabotResponse({
        statusCode: 200,
        body: metabotRetryResponse,
      });

      cy.findAllByTestId("metabot-chat-message")
        .should("have.length", 2)
        .last()
        .findByTestId("metabot-chat-message-retry")
        .click();

      cy.findAllByTestId("metabot-chat-message")
        .should("have.length", 2)
        .last()
        .findByText(/Retry: Here is the/)
        .should("exist");
    });
  });

  it("should start a new conversation when clicking a `start new conversation` button", () => {
    setup(metabotResponse);

    mountSdkContent(<MetabotQuestion />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-chat-input").type("Show orders {enter}");

      H.mockMetabotResponse({
        statusCode: 200,
        body: metabotRetryResponse,
      });

      cy.findAllByTestId("metabot-chat-message").should("have.length", 2);

      cy.findByTestId("metabot-new-conversation").click();

      cy.findAllByTestId("metabot-chat-message").should("not.exist");
      cy.findByTestId("metabot-chat-input").should("have.value", "");

      cy.findByTestId("metabot-chat-input").type("Show orders {enter}");

      cy.findAllByTestId("metabot-chat-message").should("have.length", 2);
    });
  });

  it("should set correct metabot_id both for the a new message and when retrying", () => {
    setup(metabotResponse);

    mountSdkContent(<MetabotQuestion />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-chat-input").type("Show orders {enter}");

      cy.wait("@metabotAgent").then((interception) => {
        const requestBody = interception.request.body;
        expect(requestBody).to.have.property("metabot_id", metabot_id);
      });

      H.mockMetabotResponse({
        statusCode: 200,
        body: metabotRetryResponse,
      });

      cy.findAllByTestId("metabot-chat-message")
        .should("have.length", 2)
        .last()
        .findByTestId("metabot-chat-message-retry")
        .click();

      cy.wait("@metabotAgent").then((interception) => {
        const requestBody = interception.request.body;
        expect(requestBody).to.have.property("metabot_id", metabot_id);
      });
    });
  });
});
