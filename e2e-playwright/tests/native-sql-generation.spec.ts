/**
 * Playwright port of
 * e2e/test/scenarios/metabot/native-sql-generation.cy.spec.ts
 *
 * Metabot generates SQL into the native editor from a prompt: `$mod+Shift+i`
 * opens an inline ProseMirror prompt, the (stubbed) agent streams back a
 * `code_edit` data part, and the editor shows a diff with accept/reject buttons.
 *
 * The LLM is STUBBED, never real: POST /api/metabot/agent-streaming is mocked
 * with a canned SSE body (support/metabot.ts builders). The single-db describe
 * sets `llm-anthropic-api-key` so the model reads as "configured"; no real key
 * or LLM call is involved, so those tests are jar-verifiable.
 *
 * Port notes:
 * - Opening the prompt uses openInlineSQLPrompt (re-nudge), NOT a single
 *   toggle: the `$mod+Shift+i` keymap is installed only after the metabot
 *   permissions query resolves, so a lone cold keypress can be dropped and the
 *   prompt never opens. Passed locally (warm backend) and failed only as the
 *   isolated/first test on a fresh per-worker backend under CI's fully-parallel
 *   shard load — a test-isolation gap, not backend state (the settings the app
 *   gates on are set in beforeEach). See openInlineSQLPrompt.
 * - Token-gated (EE). Skips without the pro-self-hosted token.
 * - cy.intercept(POST agent-streaming).as("agentReq") is DROPPED — it is never
 *   consumed; the spec waits on `@metabotAgent` (the alias created by
 *   H.mockMetabotResponse) instead. Ported as page.waitForResponse predicates
 *   registered before the generate click (PORTING rule 2).
 * - cy.get("@metabotAgent").its("state").should("eq","Errored") (cancel test)
 *   → page.waitForEvent("requestfailed"): cancelling aborts the in-flight fetch.
 * - The generating-loader / cancel tests need an in-flight window, so they use
 *   mockMetabotResponseWithDelay (local — the shared mockMetabotResponse fulfils
 *   immediately and cannot be edited, PORTING rule 9). No-delay cases reuse the
 *   shared mockMetabotResponse.
 * - The multi-db describe restores the `postgres-12` snapshot and drives the QA
 *   Postgres12 database, which is not in the jar's snapshots nor provisioned in
 *   this spike — gated on PW_QA_DB_ENABLED (the deliberate gate; PORTING).
 *   Faithful-by-construction, runtime-verified only when that DB is wired up.
 */
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import { mockMetabotResponse } from "../support/metabot";
import {
  acceptButton,
  cancelButton,
  errorMessage,
  generateButton,
  generatingLoader,
  inlinePrompt,
  isAgentStreamingRequest,
  mockCodeEditResponse,
  mockMetabotResponseWithDelay,
  mockTextOnlyResponse,
  openInlineSQLPrompt,
  rejectButton,
  toggleInlineSQLPrompt,
  typeInlinePrompt,
} from "../support/native-sql-generation";
import { nativeEditor, startNewNativeQuestion } from "../support/native-editor";
import { popover } from "../support/ui";

/** Register the agent-streaming response wait (PORTING rule 2). */
function waitForAgent(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      isAgentStreamingRequest(response.url()) &&
      response.request().method() === "POST",
  );
}

test.describe("Native SQL generation", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test("should show setup guidance when metabot is not configured", async ({
    page,
    mb,
  }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await startNewNativeQuestion(page);
    await expect(nativeEditor(page)).toBeVisible();
    await openInlineSQLPrompt(page);
    await expect(inlinePrompt(page)).toBeVisible();
    // jt`` splits the message around the inline <button>, so the text node lives
    // beside an element sibling — match as a substring (PORTING mixed-content).
    await expect(
      inlinePrompt(page).getByText(/To use SQL generation, please/).first(),
    ).toBeVisible();
    await expect(generateButton(page)).toHaveCount(0);

    await page.getByRole("button", { name: "connect to a model", exact: true }).click();
    // The testid sits on Mantine's Modal.Root wrapper, which Playwright reads as
    // hidden even when open; assert the modal's visible dialog content instead.
    await expect(
      page
        .getByTestId("ai-provider-configuration-modal")
        .getByRole("dialog", { name: "Connect to an AI provider" }),
    ).toBeVisible();
  });

  test.describe("single db", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.updateSetting(
        "llm-anthropic-api-key",
        "sk-ant-api03-test-token",
      );
    });

    test("should be able to successfully generate sql", async ({ page }) => {
      await startNewNativeQuestion(page, { query: "SELECT 1" });
      await expect(nativeEditor(page)).toBeVisible();

      await openInlineSQLPrompt(page);
      await expect(inlinePrompt(page)).toBeVisible();
      await expect(generateButton(page)).toBeDisabled();

      await typeInlinePrompt(page, "select all users");
      await expect(generateButton(page)).toBeEnabled();

      await mockMetabotResponseWithDelay(page, {
        body: mockCodeEditResponse("SELECT * FROM users"),
        delay: 100,
      });
      const agent = waitForAgent(page);
      await generateButton(page).click();
      await expect(generatingLoader(page)).toBeVisible();
      const response = await agent;
      const body = response.request().postDataJSON();
      const codeEditor = body.context.user_is_viewing.find(
        (ctx: { type: string }) => ctx.type === "code_editor",
      );
      expect(codeEditor).toBeTruthy();
      expect(codeEditor.buffers).toHaveLength(1);
      expect(codeEditor.buffers[0].source.language).toBe("sql");
      expect(codeEditor.buffers[0].source.database_id).toBe(1); // Sample Database

      // should auto-close input and show diff with accept/reject buttons
      await expect(inlinePrompt(page)).toHaveCount(0);
      await expect(acceptButton(page)).toBeVisible();
      await expect(rejectButton(page)).toBeVisible();
      await expect(nativeEditor(page)).toContainText("SELECT 1");
      await expect(nativeEditor(page)).toContainText("SELECT * FROM users");

      // should be able to accept changes
      await acceptButton(page).click();
      await expect(acceptButton(page)).toHaveCount(0);
      await expect(rejectButton(page)).toHaveCount(0);
      await expect(nativeEditor(page)).not.toContainText("SELECT 1");
      await expect(nativeEditor(page)).toContainText("SELECT * FROM users");
    });

    test("should be able to correctly control the input", async ({ page }) => {
      await startNewNativeQuestion(page);
      await expect(nativeEditor(page)).toBeVisible();

      // open / close the editor via key press
      await expect(inlinePrompt(page)).toHaveCount(0);
      await openInlineSQLPrompt(page);
      await expect(inlinePrompt(page)).toBeVisible();
      await toggleInlineSQLPrompt(page);
      await expect(inlinePrompt(page)).toHaveCount(0);

      // cancel button should close
      await openInlineSQLPrompt(page);
      await expect(inlinePrompt(page)).toBeVisible();
      await cancelButton(page).click();
      await expect(inlinePrompt(page)).toHaveCount(0);

      // cancel button should cancel inflight request
      await openInlineSQLPrompt(page);
      await typeInlinePrompt(page, "select all users");
      await mockMetabotResponseWithDelay(page, {
        body: mockCodeEditResponse("SELECT * FROM users"),
        delay: 1000,
      });
      const aborted = page.waitForEvent("requestfailed", (request) =>
        isAgentStreamingRequest(request.url()),
      );
      await generateButton(page).click();
      await expect(generatingLoader(page)).toBeVisible();
      await cancelButton(page).click();
      await aborted; // the in-flight request was aborted ("Errored" state)
      await expect(inlinePrompt(page)).toHaveCount(0);
      await expect(acceptButton(page)).toHaveCount(0);
    });
  });

  test.describe("multi-db", () => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the QA Postgres12 database and its postgres-12 snapshot (set PW_QA_DB_ENABLED)",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-12");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.updateSetting(
        "llm-anthropic-api-key",
        "sk-ant-api03-test-token",
      );
    });

    test("should manage conversation state correctly", async ({ page }) => {
      await startNewNativeQuestion(page, { query: "SELECT 1" });
      await expect(nativeEditor(page)).toBeVisible();

      // open input, send a prompt, get suggestion back
      await openInlineSQLPrompt(page);
      await typeInlinePrompt(page, "select all users");
      await mockMetabotResponse(page, {
        body: mockCodeEditResponse("SELECT * FROM users"),
      });
      let agent = waitForAgent(page);
      await generateButton(page).click();
      await agent;
      await expect(acceptButton(page)).toBeVisible();

      // reject the change and open input again
      await rejectButton(page).click();
      await expect(acceptButton(page)).toHaveCount(0);
      await expect(nativeEditor(page)).toContainText("SELECT 1");
      await expect(nativeEditor(page)).not.toContainText("SELECT * FROM users");
      await openInlineSQLPrompt(page);
      await expect(inlinePrompt(page)).toBeVisible();

      // send another message, history should contain rejection info
      await typeInlinePrompt(page, "try again");
      await mockMetabotResponse(page, {
        body: mockCodeEditResponse("SELECT id FROM users"),
      });
      agent = waitForAgent(page);
      await generateButton(page).click();
      const rejectionBody = (await agent).request().postDataJSON();
      expect(typeof rejectionBody.parent_message_id).toBe("string");
      expect(rejectionBody.message).toContain(
        "User rejected the following suggestion:\n\nSELECT * FROM users",
      );
      await expect(acceptButton(page)).toBeVisible();

      // change the selected database, should keep the input open
      await rejectButton(page).click();
      await openInlineSQLPrompt(page);
      await expect(inlinePrompt(page)).toBeVisible();
      await selectNativeEditorDataSource(page, "QA Postgres12");
      await expect(inlinePrompt(page)).toBeVisible();

      // changing the database starts a fresh conversation, so there's no parent
      await typeInlinePrompt(page, "select something");
      await mockMetabotResponse(page, {
        body: mockCodeEditResponse("SELECT 123"),
      });
      agent = waitForAgent(page);
      await generateButton(page).click();
      const freshBody = (await agent).request().postDataJSON();
      expect(freshBody.parent_message_id).toBeUndefined();

      // should get a valid response back
      await expect(acceptButton(page)).toBeVisible();
      await expect(nativeEditor(page)).toContainText("SELECT 123");

      // leave the page, go to new SQL page and send a new prompt
      await acceptButton(page).click();
      await page.goto("/");
      await startNewNativeQuestion(page);
      await expect(nativeEditor(page)).toBeVisible();
      await openInlineSQLPrompt(page);
      await typeInlinePrompt(page, "new prompt");
      await mockMetabotResponse(page, {
        body: mockCodeEditResponse("SELECT 456"),
      });
      agent = waitForAgent(page);
      await generateButton(page).click();
      const newPageBody = (await agent).request().postDataJSON();
      expect(newPageBody.parent_message_id).toBeUndefined();
      await expect(acceptButton(page)).toBeVisible();

      // manually editing the editor should dismiss suggestion buttons
      await nativeEditor(page).click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      await expect(acceptButton(page)).toHaveCount(0);
      await expect(rejectButton(page)).toHaveCount(0);
    });

    test("should show error if no code_edit is received", async ({ page }) => {
      await startNewNativeQuestion(page);
      await expect(nativeEditor(page)).toBeVisible();

      await openInlineSQLPrompt(page);
      await typeInlinePrompt(page, "do something");
      await mockMetabotResponse(page, {
        body: mockTextOnlyResponse("I can help with that!"),
      });
      const agent = waitForAgent(page);
      await generateButton(page).click();
      await agent;

      await expect(errorMessage(page)).toBeVisible();
      await expect(acceptButton(page)).toHaveCount(0);
    });
  });
});

/**
 * Port of H.NativeEditor.selectDataSource (e2e-native-editor-helpers.ts):
 * open the data-source picker, pick the named database. findByText is exact.
 */
async function selectNativeEditorDataSource(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.getByTestId("gui-builder-data").first().click();
  await popover(page).getByText(name, { exact: true }).click();
}
