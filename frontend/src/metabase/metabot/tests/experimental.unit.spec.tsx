import {
  assertConversation,
  enterChatMessage,
  mockAgentEndpoint,
  setup,
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
            input: { query: "test" },
          },
          {
            type: "tool-output-available",
            toolCallId: "debug_test",
            output: { result: "ok" },
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
});
