/**
 * Playwright port of e2e/test/scenarios/documents/document-metabot.cy.spec.ts
 *
 * A document Metabot block: type a prompt, press Run, and the generated chart
 * embed + description + "Created with Metabot" attribution land in the
 * document body.
 *
 * Port notes:
 * - The LLM is STUBBED. Upstream stands up a mock Anthropic server
 *   (cy.task startMockLlmServer) and points llm-anthropic-* at it, then lets
 *   the REAL backend run the `document_construct_sql_chart` tool. The document
 *   block's Run button hits POST /api/metabot/document/generate-content (a
 *   plain JSON endpoint, not the agent-streaming SSE stream), so this port
 *   mocks that endpoint's JSON response with the exact draft_card the backend
 *   would have produced from the tool call (support/document-metabot.ts). No
 *   API key reaches a real LLM; fully jar-verifiable.
 * - Token-gated (EE): metabot is only active with a token. The anthropic key
 *   is still set — not to reach an LLM (the endpoint is mocked) but because the
 *   Run button is disabled until `llm-metabot-configured?` is true, which
 *   requires the provider's key (useUserMetabotPermissions → canUseMetabot).
 * - H.createDocument({ idAlias }) + H.visitDocument("@alias") → the returned id
 *   threaded through visitDocument (PORTING rule 2 / no Cypress aliases).
 * - afterEach stopMockLlmServer is dropped — no server is started; Playwright
 *   tears the route down with the per-test context.
 */
import { resolveToken } from "../support/api";
import {
  GENERATED_CARD_NAME,
  buildSqlChartResponse,
  mockDocumentGenerateContent,
} from "../support/document-metabot";
import {
  createDocument,
  documentContent,
  getDocumentCard,
  visitDocument,
} from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DB_ID } from "../support/sample-data";

test.describe("documents > metabot (#73690)", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
  });

  test("should create a chart from a document Metabot block", async ({
    page,
    mb,
  }) => {
    // Port of the mock LLM server's document_construct_sql_chart tool call:
    // the endpoint returns the draft_card the backend derives from it.
    await mockDocumentGenerateContent(
      page,
      buildSqlChartResponse({
        databaseId: SAMPLE_DB_ID,
        name: GENERATED_CARD_NAME,
        description: "Feature requests mentioned at least twice.",
        sql: "SELECT COUNT(*) AS count FROM ORDERS",
        chartType: "bar",
      }),
    );

    const { id } = await createDocument(mb.api, {
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
    });

    await visitDocument(page, id);

    await page.getByRole("button", { name: "Run", exact: true }).click();

    await expect(getDocumentCard(page, GENERATED_CARD_NAME)).toBeVisible();
    await expect(documentContent(page)).toContainText(
      "Feature requests mentioned at least twice.",
    );
    await expect(documentContent(page)).toContainText("Created with Metabot");
  });
});
