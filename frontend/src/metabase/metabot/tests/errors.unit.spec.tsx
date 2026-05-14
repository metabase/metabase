import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { within } from "__support__/ui";
import { METABOT_ERR_MSG } from "metabase/metabot/constants";

import {
  adminQuotaLimitErroredResponse,
  assertConversation,
  chat,
  enterChatMessage,
  erroredResponse,
  input,
  lastReqBody,
  mockAgentEndpoint,
  resetChatButton,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > errors", () => {
  it("should handle non-successful responses", async () => {
    setup();
    fetchMock.post(`path:/api/metabot/agent-streaming`, 400);

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      // When no body is provided, a generic error message is shown
      ["agent", METABOT_ERR_MSG.default],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should show a better error message for unauthenticated requests", async () => {
    setup();
    fetchMock.post(`path:/api/metabot/agent-streaming`, 401);

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", METABOT_ERR_MSG.unauthenticated("Metabot")],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should keep the prompt for locked requests so it can be retried", async () => {
    setup();
    fetchMock.post(`path:/api/metabot/agent-streaming`, {
      status: 402,
      body: {
        message: "You've used all of your included AI service tokens.",
        "error-code": "metabase_ai_managed_locked",
      },
    });

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", METABOT_ERR_MSG.locked],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should not show the managed-provider lockout for unrelated 402 errors", async () => {
    setup();
    fetchMock.post(`path:/api/metabot/agent-streaming`, {
      status: 402,
      body: {
        message: "A different billing problem happened",
        "error-code": "billing-problem",
      },
    });

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", /A different billing problem happened/],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should show the backend message for admin quota limit errors", async () => {
    setup();
    mockAgentEndpoint({ textChunks: adminQuotaLimitErroredResponse });

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", /You have reached your AI usage limit for the current period/],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should mask streamed errors with a generic message", async () => {
    setup();
    mockAgentEndpoint({ textChunks: erroredResponse });

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", /Something went wrong/],
    ]);
    expect(
      within(await chat()).queryByText(/Anthropic API key expired or invalid/),
    ).not.toBeInTheDocument();
    expect(await input()).toHaveTextContent("Who is your favorite?");
  });

  it("should not show a user error when an AbortError is triggered", async () => {
    setup();
    mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);

    await userEvent.click(await resetChatButton());

    await assertConversation([]);
    expect(await input()).toHaveTextContent("");
  });

  it("should remove previous error messages and prompt when submitting next prompt", async () => {
    setup();
    fetchMock.post(`path:/api/metabot/agent-streaming`, 500);

    await enterChatMessage("Who is your favorite?");

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", METABOT_ERR_MSG.default],
    ]);
    expect(await input()).toHaveTextContent("Who is your favorite?");

    mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });
    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });

  it("should rewind the previous prompt on next submit if last response contained a stream-level error", async () => {
    setup();
    mockAgentEndpoint({ textChunks: erroredResponse });

    await enterChatMessage("first prompt");
    await assertConversation([
      ["user", "first prompt"],
      ["agent", /Something went wrong/],
    ]);

    const retrySpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });
    await enterChatMessage("new first prompt");

    await assertConversation([
      ["user", "new first prompt"],
      ["agent", "You, but don't tell anyone."],
    ]);

    const retryBody = await lastReqBody(retrySpy);
    expect(retryBody.message).toBe("new first prompt");
    expect(retryBody.history).not.toContainEqual(
      expect.objectContaining({ role: "user", content: "first prompt" }),
    );
  });
});
