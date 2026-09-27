import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";

import {
  assertConversation,
  enterChatMessage,
  erroredResponse,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > experimental", () => {
  describe("debug mode", () => {
    const mockResponse = () => {
      mockAgentEndpoint({
        events: [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Before" },
          { type: "text-end", id: "t1" },
          {
            type: "tool-input-available",
            toolCallId: "debug_test",
            toolName: "debug_test",
            input: {},
          },
          {
            type: "tool-output-available",
            toolCallId: "debug_test",
            output: "",
          },
          { type: "text-start", id: "t2" },
          { type: "text-delta", id: "t2", delta: "After" },
          { type: "text-end", id: "t2" },
        ],
      });
    };

    it("should not show tool_call messages in chat if debug mode is disabled", async () => {
      setup();
      mockResponse();

      await enterChatMessage("Don't show me tool call messages");
      await assertConversation([
        ["user", "Don't show me tool call messages"],
        ["agent", "Before"],
        ["agent", "After"],
      ]);
    });

    it("should show tool_call messages in chat if debug mode is enabled", async () => {
      setup();
      mockResponse();

      await enterChatMessage("/debug");
      await enterChatMessage("Don't show me tool call messages");
      await assertConversation([
        ["user", "Don't show me tool call messages"],
        ["agent", "Before"],
        ["agent", "debug_test"],
        ["agent", "After"],
      ]);
    });
  });

  describe("/replay", () => {
    const mockSourceConversation = () =>
      fetchMock.get("path:/api/metabot/conversations/source-convo", {
        conversation_id: "source-convo",
        created_at: "2026-09-23T00:00:00Z",
        title: "Source",
        user_id: 1,
        forked_from_conversation_id: null,
        messages: [
          {
            id: "m1",
            role: "user",
            status: { type: "complete" },
            parts: [{ id: "p1", role: "user", type: "text", message: "First" }],
          },
          {
            id: "m2",
            role: "agent",
            status: { type: "complete" },
            parts: [
              { id: "p2", role: "agent", type: "text", message: "Reply" },
            ],
          },
          {
            id: "m3",
            role: "user",
            status: { type: "complete" },
            parts: [
              { id: "p3", role: "user", type: "text", message: "Second" },
            ],
          },
        ],
      });

    it("sends another conversation's user prompts one after another", async () => {
      setup();
      mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
      mockSourceConversation();

      await enterChatMessage("/replay source-convo");
      await assertConversation([
        ["user", "First"],
        ["agent", "You, but don't tell anyone."],
        ["user", "Second"],
        ["agent", "You, but don't tell anyone."],
      ]);
    });

    it("stops at the first prompt whose response fails", async () => {
      setup();
      const agent = mockAgentEndpoint({ events: erroredResponse });
      mockSourceConversation();

      await enterChatMessage("/replay source-convo");
      expect(
        await screen.findByText("Replay stopped at prompt 1 of 2."),
      ).toBeInTheDocument();
      expect(agent.mock.calls).toHaveLength(1);
    });
  });
});
