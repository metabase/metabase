const { H } = cy;

import { useMetabot } from "@metabase/embedding-sdk-react";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const buildAdHocPath = (query: Record<string, unknown>) =>
  `/question#${btoa(
    JSON.stringify({
      dataset_query: { database: SAMPLE_DB_ID, type: "query", query },
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

// A native card with no numeric slug — the shape Metabot emits when it opens
// the SQL editor. `CurrentChart drills` must render the editor, not just the
// result window. Regression coverage for EMB-2042.
const nativeQuestionPath = `/question#${btoa(
  JSON.stringify({
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: { query: "" },
    },
    display: "table",
    visualization_settings: {},
  }),
)}`;

const buildNavigateToResponse = (path: string) =>
  H.createMetabotSSEBody(
    H.metabotTextPart(`Here is the [question link](${path})`),
    H.metabotDataPart("navigate_to", path),
  );

type MetabotConsumerProps = {
  prompts: string[];
  drills?: boolean;
};

const MetabotConsumer = ({ prompts, drills = false }: MetabotConsumerProps) => {
  const metabot = useMetabot();

  if (!metabot) {
    return null;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, padding: 8 }}>
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => {
              void metabot.submitMessage(prompt);
            }}
            // I don't like ugly buttons
            style={{
              padding: "2px 8px",
              fontSize: 12,
              border: "1px solid #ccc",
              borderRadius: 3,
              background: "#f5f5f5",
              cursor: "pointer",
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {metabot.CurrentChart && (
        <div data-testid="metabot-current-chart">
          <metabot.CurrentChart drills={drills} />
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

  it("exposes Metabot and renders CurrentChart after navigate_to", () => {
    H.mockMetabotResponse({
      statusCode: 200,
      body: buildNavigateToResponse(adHocQuestionPathOrders),
    });

    mountSdkContent(<MetabotConsumer prompts={["Show me orders"]} />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-current-chart").should("not.exist");
      cy.button("Show me orders").click();
    });

    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-current-chart").should("exist");
      cy.findByTestId("visualization-root")
        .should("contain", "Product ID")
        .and("contain", "1")
        .and("contain", "Max of Quantity")
        .and("contain", "30");
    });
  });

  it("opens the SQL editor when Metabot navigates to a native question (EMB-2042)", () => {
    H.mockMetabotResponse({
      statusCode: 200,
      body: buildNavigateToResponse(nativeQuestionPath),
    });

    mountSdkContent(
      <MetabotConsumer prompts={["Open the SQL editor"]} drills />,
    );

    getSdkRoot().within(() => {
      cy.button("Open the SQL editor").click();
    });

    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot().within(() => {
      cy.findByTestId("native-query-editor-container")
        .should("be.visible")
        .within(() => {
          // The run button lives inside the editor chrome, confirming the SQL
          // builder actually rendered — not just an empty container.
          cy.icon("play").should("be.visible");
        });
    });
  });

  it("swaps CurrentChart when a second navigate_to reaction arrives with a new path", () => {
    cy.intercept("POST", "/api/metabot/agent-streaming", (request) => {
      const path =
        request.body.message === "Show me products"
          ? adHocQuestionPathProducts
          : adHocQuestionPathOrders;
      request.reply({
        statusCode: 200,
        body: buildNavigateToResponse(path),
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      });
    }).as("metabotAgent");

    mountSdkContent(
      <MetabotConsumer prompts={["Show me orders", "Show me products"]} />,
    );

    getSdkRoot().within(() => {
      cy.button("Show me orders").click();
      cy.wait("@metabotAgent", { timeout: 20_000 });
      cy.findByTestId("visualization-root")
        .should("contain", "Product ID")
        .and("contain", "1")
        .and("contain", "Max of Quantity")
        .and("contain", "30");

      cy.button("Show me products").click();
      cy.wait("@metabotAgent", { timeout: 20_000 });

      cy.findByTestId("visualization-root")
        .should("contain", "Category")
        .and("contain", "Doohickey")
        .and("contain", "Count")
        .and("contain", "42");
    });
  });
});
