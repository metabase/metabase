const { H } = cy;

import {
  InteractiveQuestion,
  MetabotQuestion,
} from "@metabase/embedding-sdk-react";

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

const mockTextOnlyResponse = (text: string) =>
  `0:"${text}"
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;

describe("scenarios > embedding-sdk > metabot-question", () => {
  const setup = (response: string) => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.mockMetabotResponse({
      statusCode: 200,
      body: response,
    });

    cy.log("Create a question");
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

    cy.log("Create a collection");
    cy.request("POST", "/api/collection", {
      name: "first_collection",
      description: "First collection",
    }).then(({ body }) => {
      cy.wrap(body.id).as("collectionId");
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

  it("should allow saving a question", () => {
    cy.intercept("POST", "/api/card").as("postCard");

    setup(metabotResponseWithNavigateTo);

    cy.get("@collectionId").then((collectionId) => {
      mountSdkContent(
        <MetabotQuestion isSaveEnabled targetCollection={collectionId} />,
      );

      getSdkRoot().within(() => {
        cy.findByTestId("metabot-chat-input").type("Show orders {enter}");

        cy.findByTestId("visualization-root").should("exist");

        cy.findByText("Save").should("be.visible").click();

        H.modal().within(() => {
          cy.findByText("Save new question").should("be.visible");
          cy.findByRole("button", { name: "Save" }).click();
        });
      });

      cy.wait("@postCard").then((interception) => {
        const response = interception.response?.body;
        const questionId = response.id;

        mountSdkContent(<InteractiveQuestion questionId={questionId} />);
        getSdkRoot().within(() => {
          cy.findByText(
            "Orders, Max of Quantity, Grouped by Product ID, 2 rows",
          ).should("be.visible");
        });
      });
    });
  });

  it.only("should handle scrolling", () => {
    const question = "mlem ".repeat(100);
    setup(
      mockTextOnlyResponse(
        "You're absolutely right, let me rephrase that for you: " + question,
      ),
    );

    cy.get("@collectionId").then((collectionId) => {
      mountSdkContent(
        <MetabotQuestion isSaveEnabled targetCollection={collectionId} />,
      );

      getSdkRoot().within(() => {
        cy.findByTestId("metabot-chat-input").type(question + " {enter}");
      });
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

  it("should show suggestion buttons when no messages exist", () => {
    setup(metabotResponse);
    mockSuggestedPrompts();

    mountSdkContent(<MetabotQuestion />);

    getSdkRoot().within(() => {
      // Verify suggestion buttons are visible
      cy.findAllByTestId("metabot-suggestion-button", { timeout: 10_000 })
        .should("have.length", 3)
        .should("be.visible");

      // Verify suggestion texts are shown in order
      cy.findAllByTestId("metabot-suggestion-button")
        .eq(0)
        .should("contain.text", "Show me total sales by product");

      cy.findAllByTestId("metabot-suggestion-button")
        .eq(1)
        .should("contain.text", "What are the top performing products?");

      cy.findAllByTestId("metabot-suggestion-button")
        .eq(2)
        .should("contain.text", "How many orders were placed last month?");

      // Clicking on a suggestion should remove the suggestion buttons and add the user's message
      cy.findByText("Show me total sales by product").click();
      cy.findAllByTestId("metabot-suggestion-button").should("not.exist");
      cy.findAllByTestId("metabot-chat-message").should("have.length", 2);

      cy.findAllByTestId("metabot-chat-message")
        .first()
        .should("contain.text", "Show me total sales by product");
    });
  });

  it("should switch to stacked layout on small viewport", () => {
    setup(metabotResponse);
    mountSdkContent(<MetabotQuestion />);

    getSdkRoot().within(() => {
      // On desktop, use the sidebar layout
      cy.findByTestId("metabot-question-container").should(
        "have.attr",
        "data-layout",
        "sidebar",
      );

      // On mobile, use the stacked layout
      cy.viewport(400, 600);
      cy.findByTestId("metabot-overflow-button").should("be.visible");
      cy.findByTestId("metabot-question-container").should(
        "have.attr",
        "data-layout",
        "stacked",
      );

      // On desktop, use the sidebar layout
      cy.viewport(1200, 800);
      cy.findByTestId("metabot-overflow-button").should("not.be.visible");
      cy.findByTestId("metabot-question-container").should(
        "have.attr",
        "data-layout",
        "sidebar",
      );
    });
  });

  it("should fallback to sidebar layout when invalid layout prop is provided and show a warning", () => {
    setup(metabotResponse);

    cy.window().then((win) => {
      cy.spy(win.console, "warn").as("consoleWarn");
    });

    mountSdkContent(<MetabotQuestion layout="foobar" />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-question-container").should(
        "have.attr",
        "data-layout",
        "sidebar",
      );
    });

    cy.get("@consoleWarn").should(
      "have.been.calledWith",
      'Invalid layout for MetabotQuestion: foobar. Valid values are "stacked", "sidebar", or "auto"',
    );
  });
});

const mockSuggestedPrompts = () => {
  cy.intercept(
    "GET",
    "/api/ee/metabot-v3/metabot/2/prompt-suggestions?limit=3&sample=true",
    {
      statusCode: 200,
      body: {
        prompts: [
          {
            id: 1,
            prompt: "Show me total sales by product",
          },
          {
            id: 2,
            prompt: "What are the top performing products?",
          },
          {
            id: 3,
            prompt: "How many orders were placed last month?",
          },
        ],
        limit: 3,
        offset: 0,
        total: 3,
      },
    },
  ).as("suggestedPrompts");
};
