import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const GENERATED_CARD_NAME = "Feature requests mentioned twice";
const MOCK_LLM_PORT = 6124;

describe("documents > metabot (#73690)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.task("startMockLlmServer", {
      port: MOCK_LLM_PORT,
      toolCall: {
        name: "document_construct_sql_chart",
        input: {
          database_id: SAMPLE_DB_ID,
          name: GENERATED_CARD_NAME,
          description: "Feature requests mentioned at least twice.",
          analysis: "Count orders for a deterministic e2e chart.",
          approach: "Use a simple aggregate query against the sample database.",
          sql: "SELECT COUNT(*) AS count FROM ORDERS",
          viz_settings: { chart_type: "bar" },
        },
      },
    });
    H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
    H.updateSetting(
      "llm-anthropic-api-base-url",
      `http://localhost:${MOCK_LLM_PORT}`,
    );
  });

  afterEach(() => {
    cy.task("stopMockLlmServer");
  });

  it("should create a chart from a document Metabot block", () => {
    H.createDocument({
      name: "Document Metabot Chart",
      document: {
        content: [
          {
            type: "metabot",
            content: [
              {
                type: "text",
                text: "create a chart using issue customer mention",
              },
            ],
          },
        ],
        type: "doc",
      },
      collection_id: null,
      idAlias: "documentId",
    });

    H.visitDocument("@documentId");

    cy.findByRole("button", { name: "Run" }).click();

    H.getDocumentCard(GENERATED_CARD_NAME).should("be.visible");
    H.documentContent().should(
      "contain.text",
      "Feature requests mentioned at least twice.",
    );
    H.documentContent().should("contain.text", "Created with Metabot");
  });
});
