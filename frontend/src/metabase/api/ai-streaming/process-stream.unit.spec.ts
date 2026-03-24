import { processChatResponse } from "./process-stream";
import { createMockReadableStream } from "./test-utils";

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

const mockSuccessStreamData = [
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `9:{"toolCallId":"x","toolName":"x","args":""}`,
  `a:{"toolCallId":"x","result":""}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];
const getMockSuccessStream = () =>
  createMockReadableStream(mockSuccessStreamData);

const getMockErrorStream = () => createMockReadableStream([`3:{}`]);

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
    const mockStream = createMockReadableStream([
      `2:{"type":"__some_futurist_data__","version":1,"value":"hi"}`,
      `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
    ]);
    const config = getMockedCallbacks();

    const result = await processChatResponse(mockStream, config);
    // callbacks shouldn't have been triggered
    expect(config.onError).not.toHaveBeenCalled();
    expect(config.onDataPart).not.toHaveBeenCalled();
    // we should keep track of the info in the result
    expect(result.data).toEqual([
      { type: "__some_futurist_data__", value: "hi", version: 1 },
    ]);
  });

  it("should ignore unknown part types", async () => {
    const mockStream = createMockReadableStream([`x:"UNKNOWN PART TYPE"`]);
    const config = getMockedCallbacks();
    await expect(processChatResponse(mockStream, config)).resolves.toBeTruthy();
    expect(config.onError).not.toHaveBeenCalled();
  });

  it("should error if there is no part type", async () => {
    const mockStream = createMockReadableStream([`data-without-part-type`]);
    await expect(
      processChatResponse(mockStream, expectNoStreamedError),
    ).rejects.toBeTruthy();
  });

  it("should error if a tool result is returned without a preceding tool call", async () => {
    const mockStream = createMockReadableStream([
      `a:{"toolCallId":"x","result":""}`,
      `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
    ]);
    await expect(
      processChatResponse(mockStream, expectNoStreamedError),
    ).rejects.toBeTruthy();
  });

  it("should handle messages across multiple chunks", async () => {
    const mockStream = createMockReadableStream(
      [
        `0:"You, but `,
        `don't tell anyone."\n`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}\n`,
      ],
      { disableAutoInsertNewLines: true },
    );

    const result = await processChatResponse(mockStream, expectNoStreamedError);
    expect(result.text).toEqual("You, but don't tell anyone.");
    expect(result.history).toEqual([
      { content: "You, but don't tell anyone.", role: "assistant" },
    ]);
  });

  it("should resolve with partial response for aborted requests", async () => {
    const mockStream = createMockReadableStream(
      [
        `0:"Partial response"`,
        `2:{"type":"state","version":1,"value":{"testing":123}}`,
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
        createMockReadableStream([`0:"Starting response"`], {
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
