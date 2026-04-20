import { processChatResponse } from "./process-stream";
import type { SSEEvent } from "./sse-types";
import { createMockSSEStream } from "./test-utils";

const getMockedCallbacks = () => ({
  onTextPart: jest.fn(),
  onDataPart: jest.fn(),
  onToolInputStart: jest.fn(),
  onToolInputAvailable: jest.fn(),
  onToolResultPart: jest.fn(),
  onToolErrorPart: jest.fn(),
  onError: jest.fn(),
  onMessageMetadata: jest.fn(),
});

const expectNoStreamedError = {
  onError: (error: unknown) => {
    expect(error).toBeUndefined();
  },
};

const mockSuccessStreamEvents: SSEEvent[] = [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "You, but don't tell anyone." },
  { type: "text-end", id: "t1" },
  { type: "data-state", id: "d1", data: { queries: {} } },
  { type: "tool-input-start", toolCallId: "x", toolName: "x" },
  {
    type: "tool-input-available",
    toolCallId: "x",
    toolName: "x",
    input: { query: "test" },
  },
  { type: "tool-output-available", toolCallId: "x", output: { result: "ok" } },
];
const getMockSuccessStream = () => createMockSSEStream(mockSuccessStreamEvents);

const getMockErrorStream = () =>
  createMockSSEStream([{ type: "error", errorText: "Something went wrong" }]);

describe("processChatResponse", () => {
  it("should be able to process a valid stream", async () => {
    const mockStream = getMockSuccessStream();
    const result = await processChatResponse(mockStream, expectNoStreamedError);
    expect(result).toMatchSnapshot();
  });

  it("should call callbacks for relevant chunk types", async () => {
    const mockSuccessStream = getMockSuccessStream();
    const config = getMockedCallbacks();

    await processChatResponse(mockSuccessStream, config);
    expect(config.onTextPart).toHaveBeenCalled();
    expect(config.onDataPart).toHaveBeenCalled();
    expect(config.onToolInputStart).toHaveBeenCalled();
    expect(config.onToolInputAvailable).toHaveBeenCalled();
    expect(config.onToolResultPart).toHaveBeenCalled();
    const inputStartOrder = (config.onToolInputStart as jest.Mock).mock
      .invocationCallOrder[0];
    const inputAvailableOrder = (config.onToolInputAvailable as jest.Mock).mock
      .invocationCallOrder[0];
    expect(inputStartOrder).toBeLessThan(inputAvailableOrder);
    expect(config.onError).not.toHaveBeenCalled();

    const mockErrorStream = getMockErrorStream();
    try {
      await processChatResponse(mockErrorStream, config);
    } catch (_) {}
    expect(config.onError).toHaveBeenCalled();
  });

  it("should ignore unknown data parts", async () => {
    const mockStream = createMockSSEStream([
      { type: "data-some-futurist-data", id: "f1", data: "hi" },
    ]);
    const config = getMockedCallbacks();

    const result = await processChatResponse(mockStream, config);
    expect(config.onError).not.toHaveBeenCalled();
    expect(config.onDataPart).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      { type: "data-some-futurist-data", data: "hi" },
    ]);
  });

  it("should ignore unknown event types", async () => {
    const mockStream = createMockSSEStream([
      // @ts-expect-error — intentionally testing unknown event type
      { type: "some-unknown-event-type" },
    ]);
    const config = getMockedCallbacks();
    await expect(processChatResponse(mockStream, config)).resolves.toBeTruthy();
    expect(config.onError).not.toHaveBeenCalled();
  });

  it("should error if a tool result is returned without a preceding tool call", async () => {
    const mockStream = createMockSSEStream([
      {
        type: "tool-output-available",
        toolCallId: "x",
        output: { result: "ok" },
      },
    ]);
    await expect(
      processChatResponse(mockStream, expectNoStreamedError),
    ).rejects.toBeTruthy();
  });

  it("should error if a tool-output-error is returned without a preceding tool call", async () => {
    const mockStream = createMockSSEStream([
      {
        type: "tool-output-error",
        toolCallId: "x",
        errorText: "boom",
      },
    ]);
    await expect(
      processChatResponse(mockStream, expectNoStreamedError),
    ).rejects.toBeTruthy();
  });

  it("should process tool-output-error and mark the tool call as errored", async () => {
    const mockStream = createMockSSEStream([
      { type: "tool-input-start", toolCallId: "x", toolName: "failing_tool" },
      {
        type: "tool-input-available",
        toolCallId: "x",
        toolName: "failing_tool",
        input: { q: "hi" },
      },
      { type: "tool-output-error", toolCallId: "x", errorText: "kaboom" },
    ]);
    const config = getMockedCallbacks();

    const result = await processChatResponse(mockStream, config);

    expect(config.onToolErrorPart).toHaveBeenCalledWith({
      type: "tool-output-error",
      toolCallId: "x",
      errorText: "kaboom",
    });
    expect(config.onToolResultPart).not.toHaveBeenCalled();
    expect(result.toolCalls).toEqual([
      {
        toolCallId: "x",
        toolName: "failing_tool",
        state: "result",
        value: undefined,
        error: "kaboom",
      },
    ]);
    expect(result.history).toEqual([
      {
        role: "assistant",
        tool_calls: [
          { id: "x", name: "failing_tool", arguments: '{"q":"hi"}' },
        ],
      },
      { role: "tool", content: "kaboom", tool_call_id: "x" },
    ]);
  });

  it("should handle messages across multiple chunks", async () => {
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        // simulate SSE events split across TCP chunks
        controller.enqueue(
          encoder.encode(
            'data: {"type":"text-start","id":"t1"}\n\ndata: {"type":"text-delta","id":"t1","delta":"You, but ',
          ),
        );
        controller.enqueue(
          encoder.encode(
            `don't tell anyone."}\n\ndata: {"type":"text-end","id":"t1"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n`,
          ),
        );
        controller.close();
      },
    });

    const result = await processChatResponse(mockStream, expectNoStreamedError);
    expect(result.history).toEqual([
      { content: "You, but don't tell anyone.", role: "assistant" },
    ]);
  });

  it("should resolve with partial response for aborted requests", async () => {
    async function* abortingSource() {
      const encoder = new TextEncoder();
      const events = [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Partial response" },
        { type: "text-end", id: "t1" },
        { type: "data-state", id: "d1", data: { testing: 123 } },
      ];
      for (const event of events) {
        yield encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
      }
      throw new DOMException("Stream aborted", "AbortError");
    }

    const gen = abortingSource();
    const mockStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      },
    });

    const config = getMockedCallbacks();
    const result = await processChatResponse(mockStream, config);

    expect(result.aborted).toBe(true);
    expect(result.history).toEqual([
      { content: "Partial response", role: "assistant" },
    ]);
    expect(result.data).toEqual([
      { type: "data-state", data: { testing: 123 } },
    ]);
    expect(config.onTextPart).toHaveBeenCalled();
    expect(config.onDataPart).toHaveBeenCalled();
    expect(config.onError).not.toHaveBeenCalled();
  });

  describe("messageMetadata", () => {
    it("captures messageMetadata from finish event", async () => {
      const finalMeta = {
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        usageByModel: {
          "openai/gpt-5": {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        },
      };
      const mockStream = createMockSSEStream([
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "hi" },
        { type: "text-end", id: "t1" },
        { type: "finish", messageMetadata: finalMeta },
      ]);
      const config = getMockedCallbacks();

      const result = await processChatResponse(mockStream, config);

      expect(result.messageMetadata).toEqual(finalMeta);
      expect(config.onMessageMetadata).toHaveBeenCalledTimes(1);
      expect(config.onMessageMetadata).toHaveBeenCalledWith(finalMeta);
    });

    it("captures messageMetadata from message-metadata event and overwrites it with finish event", async () => {
      const midStreamMeta = {
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        usageByModel: {
          "openrouter/anthropic/claude-haiku-4-5": {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
          },
        },
      };
      const finalMeta = {
        usage: { inputTokens: 35, outputTokens: 60, totalTokens: 95 },
        usageByModel: {
          "openrouter/anthropic/claude-haiku-4-5": {
            inputTokens: 35,
            outputTokens: 60,
            totalTokens: 95,
          },
        },
      };
      const mockStream = createMockSSEStream([
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "hi" },
        { type: "text-end", id: "t1" },
        { type: "message-metadata", messageMetadata: midStreamMeta },
        { type: "finish", messageMetadata: finalMeta },
      ]);
      const config = getMockedCallbacks();

      const result = await processChatResponse(mockStream, config);

      expect(result.messageMetadata).toEqual(finalMeta);
      expect(config.onMessageMetadata).toHaveBeenCalledTimes(2);
      expect(config.onMessageMetadata).toHaveBeenNthCalledWith(
        1,
        midStreamMeta,
      );
      expect(config.onMessageMetadata).toHaveBeenNthCalledWith(2, finalMeta);
    });

    it("leaves messageMetadata undefined when finish carries no metadata", async () => {
      const mockStream = createMockSSEStream([
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "hi" },
        { type: "text-end", id: "t1" },
      ]);
      const config = getMockedCallbacks();

      const result = await processChatResponse(mockStream, config);

      expect(result.messageMetadata).toBeUndefined();
      expect(config.onMessageMetadata).not.toHaveBeenCalled();
    });
  });

  it("captures finishReason from finish event, or leaves it undefined when absent", async () => {
    const meta = {
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    };

    const withReason = await processChatResponse(
      createMockSSEStream([
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "hi" },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop", messageMetadata: meta },
      ]),
      getMockedCallbacks(),
    );
    expect(withReason.finishReason).toBe("stop");
    expect(withReason.messageMetadata).toEqual(meta);

    const withoutReason = await processChatResponse(
      createMockSSEStream([
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "hi" },
        { type: "text-end", id: "t1" },
      ]),
      getMockedCallbacks(),
    );
    expect(withoutReason.finishReason).toBeUndefined();
  });

  it("should throw error if stream errors for another reason", async () => {
    const error = new Error("some non-abort related error");

    await expect(
      processChatResponse(
        createMockSSEStream(
          [
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Starting response" },
            { type: "text-end", id: "t1" },
          ],
          {
            streamOptions: {
              async start() {
                throw error;
              },
            },
          },
        ),
        expectNoStreamedError,
      ),
    ).rejects.toThrow(error);
  });
});
