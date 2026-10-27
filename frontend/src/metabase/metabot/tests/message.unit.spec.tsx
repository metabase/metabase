import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import type { SSEEvent } from "metabase/api/ai-streaming/sse-types";
import { checkNotNull } from "metabase/utils/types";

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

// At 10 ms per paced word, this reasoning takes at least 15 s to replay.
const LONG_REASONING_WORD_COUNT = 1500;
// Keep it at most a third of the replay time above, and below the 30 s jest timeout.
const ANSWER_ARRIVAL_TIMEOUT_MS = 5000;
// At 10 ms per paced word, this reasoning takes about 2 s to replay.
const OPEN_REASONING_WORD_COUNT = 200;
// Well above the replay time above, so the paced stream ends inside the test.
const OPEN_ANSWER_ARRIVAL_TIMEOUT_MS = 8000;

const ANSWER_TEXT = "Here you go.";

// `setup` forces reduced motion, which skips the pacer. These tests need the
// pacer, so they allow motion.
const allowMotion = () => {
  const reducedMotion = window.matchMedia;
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  return () => {
    window.matchMedia = reducedMotion;
  };
};

const openChainAndReasoningStep = async () => {
  const header = await screen.findByTestId("metabot-chain-of-thought-header");
  await userEvent.click(header);
  const stepToggle = await waitFor(() =>
    checkNotNull(
      screen
        .getAllByRole("button", { name: /Thinking/ })
        .find((button) => button !== header),
    ),
  );
  await userEvent.click(stepToggle);
  expect(stepToggle).toHaveAttribute("aria-expanded", "true");
};

// Streamed markdown splits words into separate elements, so match the chat text.
const expectAnswerWithin = (timeout: number) =>
  waitFor(
    () => {
      expect(screen.getByTestId("metabot-chat")).toHaveTextContent(ANSWER_TEXT);
    },
    { timeout },
  );

const renderedWordCount = () =>
  screen.getByTestId("metabot-chain-of-thought").textContent?.match(/\bword\b/g)
    ?.length ?? 0;

describe("metabot > message", () => {
  it("should properly send chat messages", async () => {
    setup();

    const agentSpy = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });

    await enterChatMessage("Who is your favorite?", false);
    expect(await input()).toHaveTextContent("Who is your favorite?");

    await enterChatMessage("Who is your favorite?");
    expect(
      await screen.findByTestId("metabot-chain-of-thought"),
    ).toBeInTheDocument();

    agentSpy.sendResponse();

    expect(await lastReqBody(agentSpy)).not.toHaveProperty("metabot_id");

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
    await userEvent.click(await sendMessageButton());

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

  describe("reasoning pacing", () => {
    let restoreMotion = () => {};

    afterEach(() => {
      restoreMotion();
    });

    // https://github.com/metabase/metabase/issues/84969
    it("shows the answer soon after a stream with long collapsed reasoning", async () => {
      setup();
      restoreMotion = allowMotion();
      mockAgentEndpoint({
        events: [
          { type: "reasoning-start", id: "r1" },
          {
            type: "reasoning-delta",
            id: "r1",
            delta: "word ".repeat(LONG_REASONING_WORD_COUNT),
          },
          { type: "reasoning-end", id: "r1" },
          { type: "text-delta", id: "t1", delta: ANSWER_TEXT },
          { type: "finish", finishReason: "stop" },
        ],
      });

      await enterChatMessage("Question");

      await expectAnswerWithin(ANSWER_ARRIVAL_TIMEOUT_MS);
    });

    it("paces reasoning while the user has it open", async () => {
      setup();
      restoreMotion = allowMotion();
      const [pause] = createPauses(1);
      mockAgentEndpoint({
        stream: createMockSSEStream(
          (async function* () {
            yield { type: "reasoning-start", id: "r1" };
            yield { type: "reasoning-delta", id: "r1", delta: "start " };
            await pause.promise;
            yield {
              type: "reasoning-delta",
              id: "r1",
              delta: "word ".repeat(OPEN_REASONING_WORD_COUNT),
            };
            yield { type: "reasoning-end", id: "r1" };
            yield { type: "text-delta", id: "t1", delta: ANSWER_TEXT };
            yield { type: "finish", finishReason: "stop" };
          })(),
        ),
      });

      await enterChatMessage("Question");
      await openChainAndReasoningStep();
      pause.resolve();

      // Wait for the first words, outside `act`. An `act` scope returns only when
      // React has no more work, and a paced stream gives it work every 10 ms. On a
      // slow machine it then returns only after the last word.
      await waitFor(() => {
        expect(renderedWordCount()).toBeGreaterThan(0);
      });
      expect(renderedWordCount()).toBeLessThan(OPEN_REASONING_WORD_COUNT);

      await expectAnswerWithin(OPEN_ANSWER_ARRIVAL_TIMEOUT_MS);
    });
  });
});

const incompleteResponse = (
  finishReason: "length" | "tool-calls",
  messageMetadata?: { contextTokens: number; contextWindowTokens: number },
): SSEEvent[] => [
  { type: "start", messageId: "msg_incomplete" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Here is the start of a long answer" },
  { type: "text-end", id: "t1" },
  { type: "finish", finishReason, messageMetadata },
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

  it("should not offer continue when the step limit left the context window full", async () => {
    setup();
    mockAgentEndpoint({
      events: incompleteResponse("tool-calls", {
        contextTokens: 11000,
        contextWindowTokens: 11000,
      }),
    });

    await enterChatMessage("Tell me everything");

    await assertConversation([
      ["user", "Tell me everything"],
      ["agent", "Here is the start of a long answer"],
      ["agent", /paused after reaching its step limit/],
    ]);
    expect(screen.queryByTestId("metabot-chat-input")).not.toBeInTheDocument();
    expect(queryContinueResponseButton()).not.toBeInTheDocument();
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
      expect(queryContinueResponseButton()).not.toBeInTheDocument();
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
