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
        textChunks: [
          `0:"Before"`,
          `9:{"toolCallId":"debug_test","toolName":"debug_test","args":""}`,
          `a:{"toolCallId":"debug_test","result":""}`,
          `0:"After"`,
          `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
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
