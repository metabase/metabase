import { processChatResponse } from "./process-stream";
import { createMockSSEStream } from "./test-utils";

const getMockedCallbacks = () => ({
  onTextPart: jest.fn(),
  onDataPart: jest.fn(),
  onToolCallPart: jest.fn(),
  onToolResultPart: jest.fn(),
  onError: jest.fn(),
});

const expectNoStreamedError = {
  onError: (error: unknown) => {
    expect(error).toBeUndefined();
  },
};

const mockSuccessStreamEvents = [
  { type: "start", messageId: "m1" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "You, but don't tell anyone." },
  { type: "text-end", id: "t1" },
  { type: "data-state", id: "d1", data: { queries: {} } },
  { type: "tool-input-start", toolCallId: "x", toolName: "x" },
  { type: "tool-input-available", toolCallId: "x", toolName: "x", input: "" },
  { type: "tool-output-available", toolCallId: "x", toolName: "x", output: "" },
  { type: "finish-step" },
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
    expect(config.onToolCallPart).toHaveBeenCalled();
    expect(config.onToolResultPart).toHaveBeenCalled();
    expect(config.onError).not.toHaveBeenCalled();

    const mockErrorStream = getMockErrorStream();
    try {
      await processChatResponse(mockErrorStream, config);
    } catch (_) {}
    expect(config.onError).toHaveBeenCalled();
  });

  it("should ignore unknown data parts", async () => {
    const mockStream = createMockSSEStream([
      { type: "data-__some_futurist_data__", id: "f1", data: "hi" },
    ]);
    const config = getMockedCallbacks();

    const result = await processChatResponse(mockStream, config);
    expect(config.onError).not.toHaveBeenCalled();
    expect(config.onDataPart).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      { type: "data-__some_futurist_data__", data: "hi" },
    ]);
  });

  it("should ignore unknown event types", async () => {
    const mockStream = createMockSSEStream([
      { type: "some_unknown_event_type" },
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
        toolName: "x",
        output: "",
      },
    ]);
    await expect(
      processChatResponse(mockStream, expectNoStreamedError),
    ).rejects.toBeTruthy();
  });

  it("should handle messages across multiple chunks", async () => {
    // Simulate SSE events split across TCP chunks (raw bytes, not using createMockSSEStream)
    const encoder = new TextEncoder();
    const part1 =
      'data: {"type":"text-start","id":"t1"}\n\ndata: {"type":"text-delta","id":"t1","delta":"You, but ';
    const part2 = `don't tell anyone."}\n\ndata: {"type":"text-end","id":"t1"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n`;

    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(part1));
        controller.enqueue(encoder.encode(part2));
        controller.close();
      },
    });

    const result = await processChatResponse(mockStream, expectNoStreamedError);
    expect(result.history).toEqual([
      { content: "You, but don't tell anyone.", role: "assistant" },
    ]);
  });

  it("should resolve with partial response for aborted requests", async () => {
    const mockStream = createMockSSEStream(
      [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Partial response" },
        { type: "text-end", id: "t1" },
        { type: "data-state", id: "d1", data: { testing: 123 } },
      ],
      {
        streamOptions: {
          pull() {
            throw new DOMException("Stream aborted", "AbortError");
          },
        },
      },
    );
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
