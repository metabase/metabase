import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { SSEEvent } from "metabase/api/ai-streaming/sse-types";

import {
  assertConversation,
  continueResponseButton,
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  input,
  lastReqBody,
  mockAgentEndpoint,
  queryContinueResponseButton,
  queryTurnAlert,
  sendMessageButton,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > message", () => {
  it("should properly send chat messages", async () => {
    setup();

    const { sendResponse } = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");

    await enterChatMessage("Who is your favorite?");
    expect(
      await screen.findByTestId("metabot-chain-of-thought"),
    ).toBeInTheDocument();

    sendResponse();

    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();
    expect(await input()).toHaveTextContent("");
    expect(await input()).toHaveFocus();
  });

  it("should be able to send a message via send button", async () => {
    setup();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");
    (await sendMessageButton()).click();

    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();
  });

  it("keeps the reply's actions when reasoning trails the final text", async () => {
    setup();
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "text-delta", id: "t1", delta: "Here you go." };
          yield { type: "reasoning-start", id: "r1" };
          yield { type: "reasoning-delta", id: "r1", delta: "double-checking" };
          yield { type: "reasoning-end", id: "r1" };
          yield { type: "finish", finishReason: "stop" };
        })(),
      ),
    });

    await enterChatMessage("Question");

    expect(await screen.findByText("Here you go.")).toBeInTheDocument();
    expect(
      await screen.findAllByTestId("metabot-chat-message-copy"),
    ).toHaveLength(2);
  });

  it("should properly handle partial messages", async () => {
    setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "text-delta", id: "t1", delta: "You, but " };
          await pause1.promise;
          yield { type: "text-delta", id: "t1", delta: "don't tell anyone." };
          yield { type: "finish", finishReason: "stop" };
        })(),
      ),
    });

    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but"],
    ]);

    pause1.resolve();

    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });
});

const incompleteResponse = (
  finishReason: "length" | "tool-calls",
): SSEEvent[] => [
  { type: "start", messageId: "msg_incomplete" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Here is the start of a long answer" },
  { type: "text-end", id: "t1" },
  { type: "finish", finishReason },
];

describe("metabot > finish reason", () => {
  describe.each([
    ["length", /was cut off/, /Pick up exactly where you left off/],
    [
      "tool-calls",
      /paused after reaching its step limit/,
      /Continue working on my last request/,
    ],
  ] as const)("%s", (finishReason, alertRe, resumePromptRe) => {
    it("should keep the partial text and offer to continue", async () => {
      setup();
      mockAgentEndpoint({ events: incompleteResponse(finishReason) });

      await enterChatMessage("Tell me everything");

      await assertConversation([
        ["user", "Tell me everything"],
        ["agent", "Here is the start of a long answer"],
        ["agent", alertRe],
      ]);
      expect(await continueResponseButton()).toBeInTheDocument();
    });

    it("should send a continuation user turn when continue is clicked", async () => {
      setup();
      mockAgentEndpoint({ events: incompleteResponse(finishReason) });
      await enterChatMessage("Tell me everything");

      const continuationSpy = mockAgentEndpoint({
        events: [
          { type: "start", messageId: "msg_continued" },
          { type: "text-start", id: "t2" },
          { type: "text-delta", id: "t2", delta: "and here is the rest." },
          { type: "text-end", id: "t2" },
          { type: "finish", finishReason: "stop" },
        ],
      });

      await userEvent.click(await continueResponseButton());

      await assertConversation([
        ["user", "Tell me everything"],
        ["agent", "Here is the start of a long answer"],
        ["agent", alertRe],
        ["user", resumePromptRe],
        ["agent", "and here is the rest."],
      ]);
      expect((await lastReqBody(continuationSpy))?.message).toMatch(
        resumePromptRe,
      );
    });

    it("should not offer continue on earlier turns", async () => {
      setup();
      mockAgentEndpoint({ events: incompleteResponse(finishReason) });
      await enterChatMessage("Tell me everything");
      expect(await continueResponseButton()).toBeInTheDocument();

      mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
      await enterChatMessage("Nevermind, who is your favorite?");
      expect(
        await screen.findByText("You, but don't tell anyone."),
      ).toBeInTheDocument();

      expect(queryContinueResponseButton()).not.toBeInTheDocument();
    });
  });

  describe("content-filter", () => {
    it("should explain a content-filtered response", async () => {
      setup();
      mockAgentEndpoint({
        events: [
          { type: "start", messageId: "msg_filtered" },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "I can't help with that." },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: "content-filter" },
        ],
      });

      await enterChatMessage("Tell me everything");

      await assertConversation([
        ["user", "Tell me everything"],
        ["agent", "I can't help with that."],
        ["agent", /stopped by a content filter/],
      ]);
    });

    it("should not show a notice for a normal stop", async () => {
      setup();
      mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

      await enterChatMessage("Who is your favorite?");
      await assertConversation([
        ["user", "Who is your favorite?"],
        ["agent", "You, but don't tell anyone."],
      ]);
      expect(queryTurnAlert()).not.toBeInTheDocument();
    });
  });
});
