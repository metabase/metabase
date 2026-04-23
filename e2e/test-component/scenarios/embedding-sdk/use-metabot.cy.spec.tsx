const { H } = cy;

import { useMetabot } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const buildAdHocPath = (query: Record<string, unknown>) =>
  `/question#${btoa(
    JSON.stringify({
      dataset_query: { database: 1, type: "query", query },
      display: "table",
      displayIsLocked: true,
      visualization_settings: {},
    }),
  )}`;

const adHocQuestionPathOrders = buildAdHocPath({
  "source-table": ORDERS_ID,
  aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
  breakout: [["field", ORDERS.PRODUCT_ID, null]],
  limit: 2,
});

const adHocQuestionPathProducts = buildAdHocPath({
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [["field", PRODUCTS.CATEGORY, null]],
  limit: 2,
});

const buildNavigateToResponse = (path: string) =>
  `0:"Here is the [question link](${path})"
2:{"type":"navigate_to","version":1,"value":"${path}"}`;

const MetabotConsumer = () => {
  const metabot = useMetabot();

  if (!metabot) {
    return <div data-testid="metabot-loading">loading</div>;
  }

  return (
    <div data-testid="metabot-consumer">
      <button
        data-testid="metabot-send"
        type="button"
        onClick={() => {
          void metabot.submitMessage("Show me orders");
        }}
      >
        Send
      </button>

      <ul data-testid="metabot-messages">
        {metabot.messages.map((message) => (
          <li key={message.id} data-testid={`metabot-message-${message.role}`}>
            {message.type === "text" ? message.message : "chart"}
          </li>
        ))}
      </ul>

      <div data-testid="metabot-current-chart-kind">
        {metabot.CurrentChart ? "function" : "null"}
      </div>

      {metabot.CurrentChart && (
        <div data-testid="metabot-current-chart">
          <metabot.CurrentChart />
        </div>
      )}
    </div>
  );
};

describe("scenarios > embedding-sdk > use-metabot hook", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  it("exposes Metabot under a bare MetabaseProvider and renders CurrentChart after navigate_to", () => {
    H.mockMetabotResponse({
      statusCode: 200,
      body: buildNavigateToResponse(adHocQuestionPathOrders),
    });

    mountSdkContent(<MetabotConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-consumer").should("exist");
      cy.findByTestId("metabot-current-chart-kind").should("have.text", "null");
      cy.findByTestId("metabot-send").click();
    });

    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot().within(() => {
      cy.findAllByTestId("metabot-message-agent").should(
        "have.length.at.least",
        1,
      );
      cy.findByTestId("metabot-current-chart-kind").should(
        "have.text",
        "function",
      );
      cy.findByTestId("metabot-current-chart").should("exist");
      cy.findByTestId("visualization-root").should("exist");
    });
  });

  it("swaps CurrentChart when a second navigate_to reaction arrives with a new path", () => {
    let callCount = 0;
    cy.intercept("POST", "/api/metabot/agent-streaming", (request) => {
      callCount += 1;
      const body =
        callCount === 1
          ? buildNavigateToResponse(adHocQuestionPathOrders)
          : buildNavigateToResponse(adHocQuestionPathProducts);
      request.reply({
        statusCode: 200,
        body,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      });
    }).as("metabotAgent");

    mountSdkContent(<MetabotConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-send").click();
    });
    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot()
      .findByTestId("visualization-root")
      .should("exist")
      .invoke("text")
      .then((firstChartText) => {
        getSdkRoot().within(() => {
          cy.findByTestId("metabot-send").click();
        });
        cy.wait("@metabotAgent", { timeout: 20_000 });

        getSdkRoot()
          .findByTestId("visualization-root")
          .should("exist")
          .invoke("text")
          .should((secondChartText) => {
            expect(secondChartText).to.not.equal(firstChartText);
          });
      });
  });
});
