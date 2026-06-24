import { processChatResponse } from "./process-stream";
import type { SSEEvent } from "./sse-types";
import { createMockReadableStream, createMockSSEStream } from "./test-utils";

const getMockedCallbacks = () => ({
  onStart: jest.fn(),
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

const mockSuccessEvents: SSEEvent[] = [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "You, but don't tell anyone." },
  { type: "text-end", id: "t1" },
  { type: "data-state", data: { queries: {} } },
  { type: "tool-input-available", toolCallId: "x", toolName: "x", input: {} },
  { type: "tool-output-available", toolCallId: "x", output: "" },
  {
    type: "finish",
    finishReason: "stop",
    messageMetadata: {
      usage: { inputTokens: 4916, outputTokens: 8, totalTokens: 4924 },
    },
  },
];
const getMockSuccessStream = () => createMockSSEStream(mockSuccessEvents);

const getMockErrorStream = () =>
  createMockSSEStream([{ type: "error", errorText: "boom" }]);

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
    expect(config.onToolInputAvailable).toHaveBeenCalled();
    expect(config.onToolResultPart).toHaveBeenCalled();
    expect(config.onMessageMetadata).toHaveBeenCalled();
    expect(config.onError).not.toHaveBeenCalled();

    const mockErrorStream = getMockErrorStream();
    await processChatResponse(mockErrorStream, config);
    expect(config.onError).toHaveBeenCalledWith({ errorText: "boom" });
  });

  it("should surface a typed error's code via finish messageMetadata", async () => {
    const config = getMockedCallbacks();
    const result = await processChatResponse(
      createMockSSEStream([
        { type: "error", errorText: "nope" },
        {
          type: "finish",
          finishReason: "error",
          messageMetadata: { errorCode: "ai_usage_limit_reached" },
        },
      ]),
      config,
    );
    expect(config.onError).toHaveBeenCalledWith({ errorText: "nope" });
    expect(result.messageMetadata?.errorCode).toBe("ai_usage_limit_reached");
  });

  it("should ignore unknown data parts", async () => {
    const mockStream = createMockSSEStream([
      { type: "data-__some_futurist_data__", data: "hi" },
    ]);
    const config = getMockedCallbacks();

    const result = await processChatResponse(mockStream, config);
    // callbacks shouldn't have been triggered
    expect(config.onError).not.toHaveBeenCalled();
    expect(config.onDataPart).not.toHaveBeenCalled();
    // we should keep track of the info in the result
    expect(result.data).toEqual([
      { type: "data-__some_futurist_data__", data: "hi" },
    ]);
  });

  it("should ignore unhandled event types", async () => {
    const mockStream = createMockSSEStream([
      { type: "reasoning-start", id: "r1" } as unknown as SSEEvent,
    ]);
    const config = getMockedCallbacks();
    await expect(processChatResponse(mockStream, config)).resolves.toBeTruthy();
    expect(config.onError).not.toHaveBeenCalled();
  });

  it("should skip unparseable events without throwing", async () => {
    const mockStream = createMockReadableStream([`data: {bad json\n`]);
    const config = getMockedCallbacks();
    await expect(processChatResponse(mockStream, config)).resolves.toBeTruthy();
    expect(config.onError).not.toHaveBeenCalled();
  });

  it("should error if a tool result is returned without a preceding tool call", async () => {
    const mockStream = createMockSSEStream([
      { type: "tool-output-available", toolCallId: "x", output: "" },
    ]);
    await expect(
      processChatResponse(mockStream, expectNoStreamedError),
    ).rejects.toBeTruthy();
  });

  it("should stitch text deltas into a single history entry", async () => {
    const mockStream = createMockSSEStream([
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "You, but " },
      { type: "text-delta", id: "t1", delta: "don't tell anyone." },
      { type: "text-end", id: "t1" },
    ]);

    const result = await processChatResponse(mockStream, expectNoStreamedError);
    expect(result.history).toEqual([
      { content: "You, but don't tell anyone.", role: "assistant" },
    ]);
  });

  it("should resolve with partial response for aborted requests", async () => {
    const partialEvents: SSEEvent[] = [
      { type: "text-delta", id: "t1", delta: "Partial response" },
      { type: "data-state", data: { testing: 123 } },
    ];
    const encoder = new TextEncoder();
    let index = 0;
    const mockStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < partialEvents.length) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify(partialEvents[index++])}\n\n`,
            ),
          );
        } else {
          throw new DOMException("Stream aborted", "AbortError");
        }
      },
    });
    const config = getMockedCallbacks();

    const result = await processChatResponse(mockStream, config);

    expect(result).toMatchSnapshot();
    expect(config.onTextPart).toHaveBeenCalled();
    expect(config.onDataPart).toHaveBeenCalled();
    expect(config.onError).not.toHaveBeenCalled();
  });

  it("should throw error if stream errors for another reason", async () => {
    const error = new Error("some non-abort related error");

    await expect(
      processChatResponse(
        createMockSSEStream([], {
          streamOptions: {
            async start() {
              throw error;
            },
          },
        }),
        expectNoStreamedError,
      ),
    ).rejects.toThrow(error);
  });
});
