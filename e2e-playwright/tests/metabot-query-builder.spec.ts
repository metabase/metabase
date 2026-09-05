/**
 * Playwright port of e2e/test/scenarios/metabot/metabot-query-builder.cy.spec.ts
 *
 * The Metabot LLM is STUBBED, never real: every test mocks POST
 * /api/metabot/agent-streaming with a canned SSE body (text / data / error
 * parts) built from the pure builders in support/metabot.ts, and asserts the
 * resulting query-builder action (reply inline, chart inline, navigate_to,
 * suggested prompts, error). No API key, so the whole spec is jar-verifiable.
 *
 * Port notes:
 * - Token-gated (EE). The describe activates "pro-self-hosted" and skips if the
 *   token env var is missing.
 * - The Cypress beforeEach aliases the endpoint as `@agentReq` but nothing ever
 *   waits on it (tests use the `@metabotAgent` alias that mockMetabotResponse
 *   sets). Dropped per PORTING rule 2; where a test inspects the request we
 *   register waitForAgentRequest() before sending.
 * - `cy.wait("@metabotAgent").then(({request}) => request.body.profile_id)` →
 *   waitForAgentRequest → response.request().postDataJSON().
 * - mockMetabotResponse's Cypress `delay` option (navigate_to test) has no
 *   Playwright equivalent in the shared helper and isn't needed — the test only
 *   asserts the final URL + QB header — so it's dropped.
 * - findByRole/findByText string args are exact (PORTING rule 1).
 */
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import {
  lastChatMessage,
  metabotChatInput,
  metabotChatSidebar,
  mockMetabotResponse,
  sendMetabotMessage,
} from "../support/metabot";
import {
  allOrdersQuestion,
  mockErrorResponse,
  mockGeneratedEntityResponse,
  mockNavigateToResponse,
  mockPromptSuggestions,
  mockTextOnlyResponse,
  waitForAgentRequest,
} from "../support/metabot-query-builder";
import { adhocQuestionHash } from "../support/permissions";
import { main, newButton, popover, queryBuilderHeader } from "../support/ui";

test.describe("Metabot Query Builder", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
  });

  test("should show setup guidance when llm-metabot-configured? is false", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("llm-anthropic-api-key", "");
    await page.goto("/question/ask");
    await expect(page).toHaveURL(/\/question\/ask/);

    const connectButton = page.getByRole("button", {
      name: "connect to a model",
      exact: true,
    });
    await expect(connectButton).toBeVisible();
    await connectButton.click();
    // The testid sits on the Mantine Modal-root wrapper, which only renders when
    // `opened` but has a zero-size box (its children are position:fixed), so
    // Playwright's toBeVisible reports it hidden. Assert the modal opened via its
    // visible dialog content instead — faithful to Cypress's "modal is shown".
    const providerModal = page.getByTestId("ai-provider-configuration-modal");
    await expect(providerModal).toBeAttached();
    await expect(
      providerModal.getByText("Connect to an AI provider", { exact: true }),
    ).toBeVisible();
  });

  test("should redirect to notebook when metabot-enabled? is false", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("metabot-enabled?", false);

    // visiting "/question/ask" should redirect to notebook when metabot is disabled
    await page.goto("/question/ask");
    await expect(page).toHaveURL(/\/question#/);
    await expect(metabotChatSidebar(page)).toHaveCount(0);
  });

  test("should not show AI exploration in new button when metabot is disabled", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("metabot-enabled?", false);
    await page.goto("/");

    // "AI exploration" option should not appear in new button
    await newButton(page).click();
    await expect(
      popover(page).getByText("AI exploration", { exact: true }),
    ).toHaveCount(0);
  });

  test("should render the agent's reply inline without leaving the page", async ({
    page,
  }) => {
    await page.goto("/question/ask");
    await expect(metabotChatInput(page)).toBeVisible();

    await mockMetabotResponse(page, {
      body: mockTextOnlyResponse("Here's what I found."),
    });
    const agentRequest = waitForAgentRequest(page);
    await sendMetabotMessage(page, "Tell me about my data");

    // the full-page conversation uses the nlq profile
    const response = await agentRequest;
    expect(response.request().postDataJSON().profile_id).toBe("nlq");

    // the reply renders inline in the full-page conversation...
    await expect(lastChatMessage(page)).toHaveText("Here's what I found.");

    // ...and we move to the conversation's permalink
    await expect(page).toHaveURL(/\/metabot\/conversation\//);
  });

  test("should render a generated chart inline without leaving the page", async ({
    page,
  }) => {
    await page.goto("/question/ask");
    await expect(metabotChatInput(page)).toBeVisible();

    await mockMetabotResponse(page, {
      body: mockGeneratedEntityResponse(allOrdersQuestion.dataset_query),
    });
    const agentRequest = waitForAgentRequest(page);
    await sendMetabotMessage(page, "Show me all orders");
    await agentRequest;

    // the chart renders inline rather than in the query builder, and we move to
    // the conversation's permalink
    await expect(page.getByTestId("metabot-inline-chart")).toBeVisible();
    await expect(queryBuilderHeader(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/metabot\/conversation\//);
  });

  test("should navigate to a question when the agent returns a navigate_to", async ({
    page,
  }) => {
    await page.goto("/");

    // go to new button and click "AI exploration"
    await newButton(page).click();
    await popover(page).getByText("AI exploration", { exact: true }).click();
    await expect(page).toHaveURL(/\/question\/ask/);
    await expect(metabotChatSidebar(page)).toHaveCount(0);

    const questionHash = adhocQuestionHash(allOrdersQuestion);
    await mockMetabotResponse(page, {
      body: mockNavigateToResponse(`/question#${questionHash}`),
    });
    await sendMetabotMessage(page, "Show me all orders");

    // when we receive a navigate_to, we should be taken to a question
    await expect(page).toHaveURL(/\/question#/);
    await expect(queryBuilderHeader(page)).toContainText("Orders");
  });

  test("should support clicking suggested prompts", async ({ page }) => {
    // mock suggested prompts
    await mockPromptSuggestions(page, [{ prompt: "Show me all orders" }]);

    // visit AI exploration page
    await page.goto("/question/ask");
    await expect(metabotChatInput(page)).toBeVisible();

    // click suggested prompt
    const questionHash = adhocQuestionHash(allOrdersQuestion);
    await mockMetabotResponse(page, {
      body: mockNavigateToResponse(`/question#${questionHash}`),
    });
    const agentRequest = waitForAgentRequest(page);
    await main(page).getByText("Show me all orders", { exact: true }).click();
    await agentRequest;

    // should be taken to a question
    await expect(page).toHaveURL(/\/question#/);
    await expect(queryBuilderHeader(page)).toContainText("Orders");
  });

  test("should handle errors", async ({ page }) => {
    // visit AI exploration page
    await page.goto("/question/ask");
    await expect(metabotChatInput(page)).toBeVisible();

    // mock the agent request to stream an error
    await mockMetabotResponse(page, { body: mockErrorResponse });

    // send a prompt
    await sendMetabotMessage(page, "Show me all orders");

    // should show an error message inline
    await expect(lastChatMessage(page)).toContainText("Something went wrong");
  });
});
