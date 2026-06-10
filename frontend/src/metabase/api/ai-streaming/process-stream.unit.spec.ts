import { processChatResponse } from "./process-stream";
import type { SSEEvent } from "./sse-types";
import { createMockSSEStream } from "./test-utils";

const getMockedCallbacks = () => ({
  onStartMessagePart: jest.fn(),
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
  { type: "text-delta", id: "t1", delta: "You, but " },
  { type: "text-delta", id: "t1", delta: "don't tell anyone." },
  { type: "text-end", id: "t1" },
  { type: "data-state", id: "d1", data: { queries: {} } },
  { type: "tool-input-start", toolCallId: "x", toolName: "search" },
  {
    type: "tool-input-available",
    toolCallId: "x",
    toolName: "search",
    input: { query: "test" },
  },
  { type: "tool-output-available", toolCallId: "x", output: "rows" },
];
const getMockSuccessStream = () => createMockSSEStream(mockSuccessStreamEvents);

describe("processChatResponse", () => {
  it("should be able to process a valid stream", async () => {
    const mockStream = getMockSuccessStream();
    const result = await processChatResponse(mockStream, expectNoStreamedError);
    expect(result).toMatchSnapshot();
  });

  it("should call callbacks for relevant event types", async () => {
    const config = getMockedCallbacks();

    await processChatResponse(getMockSuccessStream(), config);
    expect(config.onStartMessagePart).toHaveBeenCalledWith({
      type: "start",
      messageId: "mock-message",
    });
    expect(config.onTextPart).toHaveBeenCalledWith("You, but ");
    expect(config.onDataPart).toHaveBeenCalledWith({
      type: "data-state",
      data: { queries: {} },
    });
    expect(config.onToolInputStart).toHaveBeenCalled();
    expect(config.onToolInputAvailable).toHaveBeenCalled();
    expect(config.onToolResultPart).toHaveBeenCalled();
    const inputStartOrder = config.onToolInputStart.mock.invocationCallOrder[0];
    const inputAvailableOrder =
      config.onToolInputAvailable.mock.invocationCallOrder[0];
    expect(inputStartOrder).toBeLessThan(inputAvailableOrder);
    expect(config.onToolErrorPart).not.toHaveBeenCalled();
    expect(config.onError).not.toHaveBeenCalled();
  });

  it("should stitch text deltas into separate history entries by block id", async () => {
    const result = await processChatResponse(
      createMockSSEStream([
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "first " },
        { type: "text-delta", id: "t1", delta: "block" },
        { type: "text-end", id: "t1" },
        { type: "text-start", id: "t2" },
        { type: "text-delta", id: "t2", delta: "second block" },
        { type: "text-end", id: "t2" },
      ]),
      expectNoStreamedError,
    );
    expect(result.history).toEqual([
      { role: "assistant", content: "first block" },
      { role: "assistant", content: "second block" },
    ]);
  });

  it("should mark tool errors on the matching tool call", async () => {
    const config = getMockedCallbacks();
    const result = await processChatResponse(
      createMockSSEStream([
        {
          type: "tool-input-available",
          toolCallId: "x",
          toolName: "search",
          input: { query: "test" },
        },
        { type: "tool-output-error", toolCallId: "x", errorText: "boom" },
      ]),
      config,
    );
    expect(config.onToolErrorPart).toHaveBeenCalled();
    expect(result.toolCalls).toEqual([
      { toolCallId: "x", toolName: "search", state: "result", error: "boom" },
    ]);
    expect(result.history).toEqual([
      {
        role: "assistant",
        tool_calls: [
          { id: "x", name: "search", arguments: '{"query":"test"}' },
        ],
      },
      { role: "tool", content: "boom", tool_call_id: "x" },
    ]);
  });

  it("should keep unknown data parts in the result without calling onDataPart", async () => {
    const config = getMockedCallbacks();

    const result = await processChatResponse(
      createMockSSEStream([
        { type: "data-some-futurist-data", id: "f1", data: "hi" },
      ]),
      config,
    );
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

  it("should error if a tool output is returned without a preceding tool input", async () => {
    const mockStream = createMockSSEStream([
      { type: "tool-output-available", toolCallId: "x", output: "ok" },
    ]);
    await expect(
      processChatResponse(mockStream, expectNoStreamedError),
    ).rejects.toThrow(/must be preceded/);
  });

  it("should surface error events through onError and the result", async () => {
    const config = getMockedCallbacks();
    const result = await processChatResponse(
      createMockSSEStream([
        { type: "error", errorText: "Something went wrong" },
      ]),
      config,
    );
    expect(config.onError).toHaveBeenCalledWith({
      message: "Something went wrong",
      error_code: undefined,
    });
    expect(result.error).toEqual({
      message: "Something went wrong",
      error_code: undefined,
    });
  });

  it("should merge data-error_details into the error", async () => {
    const config = getMockedCallbacks();
    const result = await processChatResponse(
      createMockSSEStream([
        {
          type: "data-error_details",
          id: "e1",
          data: {
            message: "You have reached your AI usage limit.",
            error_code: "ai_usage_limit_reached",
          },
        },
        { type: "error", errorText: "You have reached your AI usage limit." },
      ]),
      config,
    );
    expect(config.onDataPart).not.toHaveBeenCalled();
    expect(result.error).toEqual({
      message: "You have reached your AI usage limit.",
      error_code: "ai_usage_limit_reached",
    });
  });

  describe("message metadata", () => {
    it("captures metadata, finish superseding mid-stream snapshots", async () => {
      const midStreamMeta = {
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
      const finalMeta = {
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      };
      const config = getMockedCallbacks();

      const result = await processChatResponse(
        createMockSSEStream([
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "hi" },
          { type: "text-end", id: "t1" },
          { type: "message-metadata", messageMetadata: midStreamMeta },
          { type: "finish-step" },
          { type: "finish", finishReason: "stop", messageMetadata: finalMeta },
        ]),
        config,
      );

      expect(result.messageMetadata).toEqual(finalMeta);
      expect(result.finishReason).toBe("stop");
      expect(config.onMessageMetadata).toHaveBeenNthCalledWith(
        1,
        midStreamMeta,
      );
      expect(config.onMessageMetadata).toHaveBeenNthCalledWith(2, finalMeta);
    });

    it("leaves metadata and finishReason undefined when absent", async () => {
      const config = getMockedCallbacks();
      const result = await processChatResponse(
        createMockSSEStream([
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "hi" },
          { type: "text-end", id: "t1" },
        ]),
        config,
      );

      expect(result.messageMetadata).toBeUndefined();
      expect(result.finishReason).toBeUndefined();
      expect(config.onMessageMetadata).not.toHaveBeenCalled();
    });
  });

  it("should return a partial response when the stream aborts", async () => {
    const result = await processChatResponse(
      createMockSSEStream(
        [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Starting response" },
        ],
        {
          streamOptions: {
            async start() {
              throw new DOMException("Stream aborted", "AbortError");
            },
          },
        },
      ),
      expectNoStreamedError,
    );
    expect(result.aborted).toBe(true);
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
