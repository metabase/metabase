import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import {
  assertConversation,
  createMockReadableStream,
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
      stream: createMockReadableStream(
        (async function* () {
          yield `9:{"toolCallId":"x","toolName":"analyze_data","args":""}\n`;
          yield `a:{"toolCallId":"x","result":""}\n`;
          await pause1.promise;
          yield `9:{"toolCallId":"y","toolName":"analyze_chart","args":""}\n`;
          yield `a:{"toolCallId":"y","result":""}\n`;
          await pause2.promise;
          yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
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
      stream: createMockReadableStream(
        (async function* () {
          yield `9:{"toolCallId":"x","toolName":"analyze_data","args":""}\n`;
          yield `a:{"toolCallId":"x","result":""}\n`;
          await pause1.promise;
          yield `0:"Hey."`;
          await pause2.promise;
          yield `9:{"toolCallId":"y","toolName":"analyze_chart","args":""}\n`;
          yield `a:{"toolCallId":"y","result":""}\n`;
          await pause3.promise;
          yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
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
      textChunks: [
        `0:"Response 1"`,
        `9:{"toolCallId":"x","toolName":"x","args":""}`,
        `a:{"toolCallId":"x","result":""}`,
        `0:"Response 2"`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
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
      stream: createMockReadableStream(
        (async function* () {
          yield `0:"You, but "\n`;
          await pause1.promise;
          yield `0:"don't tell anyone."\n`;
        })(),
      ),
    });

    await enterChatMessage("Who is your favorite?");
    await userEvent.click(await stopResponseButton());
    pause1.resolve();

    mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });
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
      stream: createMockReadableStream(
        (async function* () {
          yield `0:"You, but "\n`;
          await pause1.promise;
          yield `0:"don't tell anyone."\n`;
        })(),
      ),
    });

    await enterChatMessage("Who is your favorite?");
    await userEvent.type(await input(), "{Escape}");
    pause1.resolve();

    mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });
    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but"],
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);
  });
});
