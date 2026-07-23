import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { getMetabotConversation } from "metabase/metabot/state";

import {
  assertConversation,
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  input,
  mockAgentEndpoint,
  setup,
  stopResponseButton,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > tool calls", () => {
  it("should stream each tool call into the chain of thought, settling when finished", async () => {
    setup();

    const [pause1, pause2] = createPauses(2);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield {
            type: "tool-input-available",
            toolCallId: "x",
            toolName: "analyze_data",
            input: {},
          };
          yield { type: "tool-output-available", toolCallId: "x", output: "" };
          await pause1.promise;
          yield {
            type: "tool-input-available",
            toolCallId: "y",
            toolName: "analyze_chart",
            input: {},
          };
          yield { type: "tool-output-available", toolCallId: "y", output: "" };
          await pause2.promise;
          yield { type: "finish", finishReason: "stop" };
        })(),
      ),
    });

    await enterChatMessage("Analyze this query");

    // the current step always reads in the present tense while the turn is live
    expect(
      (await screen.findAllByText("Analyzing the data")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Inspecting the visualization"),
    ).not.toBeInTheDocument();

    pause1.resolve();

    expect(
      (await screen.findAllByText("Inspecting the visualization")).length,
    ).toBeGreaterThan(0);

    pause2.resolve();

    // once settled the chain collapses and every label flips to the past tense
    // (a fast turn rolls up to "Worked briefly")
    expect(
      await screen.findByText(/Worked (briefly|for|on)/),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Analyzed the data")).not.toBeVisible();
    });
    expect(screen.getByText("Inspected the visualization")).not.toBeVisible();
  });

  it("should settle the chain when answer text arrives and start a fresh one for later tools", async () => {
    setup();

    const [pause1, pause2, pause3] = createPauses(3);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield {
            type: "tool-input-available",
            toolCallId: "x",
            toolName: "analyze_data",
            input: {},
          };
          yield { type: "tool-output-available", toolCallId: "x", output: "" };
          await pause1.promise;
          yield { type: "text-delta", id: "t1", delta: "Hey." };
          await pause2.promise;
          yield {
            type: "tool-input-available",
            toolCallId: "y",
            toolName: "analyze_chart",
            input: {},
          };
          yield { type: "tool-output-available", toolCallId: "y", output: "" };
          await pause3.promise;
          yield { type: "finish", finishReason: "stop" };
        })(),
      ),
    });

    await enterChatMessage("Analyze this query");

    expect(
      (await screen.findAllByText("Analyzing the data")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Inspecting the visualization"),
    ).not.toBeInTheDocument();

    pause1.resolve();
    pause2.resolve();

    // answer text settles the first chain (its label flips to past tense); a
    // fresh chain previews the next tool in the present tense
    expect(await screen.findByText("Hey.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Analyzed the data")).not.toBeVisible();
    });
    expect(
      (await screen.findAllByText("Inspecting the visualization")).length,
    ).toBeGreaterThan(0);

    pause3.resolve();

    await waitFor(async () => {
      await assertConversation([
        ["user", "Analyze this query"],
        ["agent", "Hey."],
      ]);
    });
  });

  it("should start a new message if there's tool calls between streamed text parts", async () => {
    setup();
    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Response 1" },
        { type: "text-end", id: "t1" },
        {
          type: "tool-input-available",
          toolCallId: "x",
          toolName: "x",
          input: {},
        },
        { type: "tool-output-available", toolCallId: "x", output: "" },
        { type: "text-start", id: "t2" },
        { type: "text-delta", id: "t2", delta: "Response 2" },
        { type: "text-end", id: "t2" },
      ],
    });
    await enterChatMessage("Request");

    await waitFor(async () => {
      await assertConversation([
        ["user", "Request"],
        ["agent", "Response 1"],
        ["agent", "Response 2"],
      ]);
    });
  });

  it("should be able to stop a response via stop button", async () => {
    setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "text-delta", id: "t1", delta: "You, but " };
          await pause1.promise;
          yield { type: "text-delta", id: "t1", delta: "don't tell anyone." };
        })(),
      ),
    });

    await enterChatMessage("Who is your favorite?");
    await userEvent.click(await stopResponseButton());
    pause1.resolve();

    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but"],
      ["agent", /Response.+was interrupted/],
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });

  it("should be able to stop a response via escape press", async () => {
    setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "text-delta", id: "t1", delta: "You, but " };
          await pause1.promise;
          yield { type: "text-delta", id: "t1", delta: "don't tell anyone." };
        })(),
      ),
    });

    await enterChatMessage("Who is your favorite?");
    await userEvent.type(await input(), "{Escape}");
    pause1.resolve();

    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but"],
      ["agent", /Response.+was interrupted/],
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });

  it("should mark unresolved tool calls as ended when a request is aborted", async () => {
    const { store } = setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield {
            type: "tool-input-available",
            toolCallId: "test",
            toolName: "test",
            input: {},
          };
          await pause1.promise;
        })(),
      ),
    });
    await enterChatMessage("hi");
    await userEvent.click(await stopResponseButton());
    pause1.resolve();
    await waitFor(() => {
      const { messages } = getMetabotConversation(store.getState(), "omnibot");
      expect(messages).toContainEqual(
        expect.objectContaining({
          type: "tool_call",
          status: "ended",
          is_error: true,
          result: "Tool execution interrupted by user",
        }),
      );
    });
  });
});
