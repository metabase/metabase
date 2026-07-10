const { H } = cy;

const GENERATED_CARD_NAME = "Feature requests mentioned twice";
const MOCK_LLM_PORT = 6124;

describe("documents > metabot (#73690)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.task("startMockLlmServer", {
      port: MOCK_LLM_PORT,
      responses: [
        {
          toolCall: {
            name: "construct_notebook_query",
            input: {
              query: {
                "lib/type": "mbql/query",
                stages: [
                  {
                    "lib/type": "mbql.stage/mbql",
                    "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
                    limit: 10,
                  },
                ],
              },
              title: GENERATED_CARD_NAME,
              visualization: { chart_type: "table" },
              chart_name: GENERATED_CARD_NAME,
              chart_description: "Feature requests mentioned at least twice.",
            },
          },
        },
        { responseText: "Created a chart." },
      ],
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
