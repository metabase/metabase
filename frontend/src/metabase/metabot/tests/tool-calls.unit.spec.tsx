import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

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
  it("should show list each tool being called as it comes in and cleared when finished", async () => {
    setup();

    const [pause1, pause2] = createPauses(2);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield {
            type: "tool-input-available",
            toolCallId: "x",
            toolName: "analyze_data",
            input: "",
          };
          yield {
            type: "tool-output-available",
            toolCallId: "x",
            toolName: "analyze_data",
            output: "",
          };
          await pause1.promise;
          yield {
            type: "tool-input-available",
            toolCallId: "y",
            toolName: "analyze_chart",
            input: "",
          };
          yield {
            type: "tool-output-available",
            toolCallId: "y",
            toolName: "analyze_chart",
            output: "",
          };
          await pause2.promise;
          yield { type: "finish" };
          yield "[DONE]";
        })(),
      ),
    });

    await enterChatMessage("Analyze this query");

    expect(await screen.findByText("Analyzing the data")).toBeInTheDocument();
    expect(
      screen.queryByText("Inspecting the visualization"),
    ).not.toBeInTheDocument();

    pause1.resolve();

    expect(await screen.findByText("Analyzing the data")).toBeInTheDocument();
    expect(
      await screen.findByText("Inspecting the visualization"),
    ).toBeInTheDocument();

    pause2.resolve();

    await waitFor(() => {
      expect(screen.queryByText("Analyzing the data")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.queryByText("Inspecting the visualization"),
      ).not.toBeInTheDocument();
    });
  });

  it("should clear out list of tool calls when new text comes in", async () => {
    setup();

    const [pause1, pause2, pause3] = createPauses(3);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield {
            type: "tool-input-available",
            toolCallId: "x",
            toolName: "analyze_data",
            input: "",
          };
          yield {
            type: "tool-output-available",
            toolCallId: "x",
            toolName: "analyze_data",
            output: "",
          };
          await pause1.promise;
          yield { type: "text-delta", id: "t1", delta: "Hey." };
          await pause2.promise;
          yield {
            type: "tool-input-available",
            toolCallId: "y",
            toolName: "analyze_chart",
            input: "",
          };
          yield {
            type: "tool-output-available",
            toolCallId: "y",
            toolName: "analyze_chart",
            output: "",
          };
          await pause3.promise;
          yield { type: "finish" };
          yield "[DONE]";
        })(),
      ),
    });

    await enterChatMessage("Analyze this query");

    expect(await screen.findByText("Analyzing the data")).toBeInTheDocument();
    expect(
      screen.queryByText("Inspecting the visualization"),
    ).not.toBeInTheDocument();

    pause1.resolve();

    await waitFor(() => {
      expect(screen.queryByText("Analyzing the data")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Hey.")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("Inspecting the visualization"),
      ).not.toBeInTheDocument();
    });

    pause2.resolve();

    expect(await screen.findByText("Hey.")).toBeInTheDocument();
    expect(
      await screen.findByText("Inspecting the visualization"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Analyzing the data")).not.toBeInTheDocument();

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
        { type: "text-delta", id: "t1", delta: "Response 1" },
        {
          type: "tool-input-available",
          toolCallId: "x",
          toolName: "x",
          input: "",
        },
        {
          type: "tool-output-available",
          toolCallId: "x",
          toolName: "x",
          output: "",
        },
        { type: "text-delta", id: "t2", delta: "Response 2" },
        { type: "finish" },
        "[DONE]",
      ],
    });
    await enterChatMessage("Request");

    await assertConversation([
      ["user", "Request"],
      ["agent", "Response 1"],
      ["agent", "Response 2"],
    ]);
  });

  it("should be able to stop a response via stop button", async () => {
    setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "text-delta", id: "t1", delta: "You, but " };
          await pause1.promise;
          yield { type: "text-delta", id: "t2", delta: "don't tell anyone." };
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
          yield { type: "text-delta", id: "t2", delta: "don't tell anyone." };
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
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });
});
