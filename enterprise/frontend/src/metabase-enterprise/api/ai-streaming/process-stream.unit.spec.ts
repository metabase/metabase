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

// TODO: check code coverage

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

  it("should not error when seeing data parts it does not recognize", async () => {
    const mockStream = createMockReadableStream([
      `2:{"type":"__invalid__","version":1,"value":"hi"}`,
      `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
    ]);
    const config = getMockedCallbacks();
    await expect(processChatResponse(mockStream, config)).resolves.toBeTruthy();
    expect(config.onError).not.toHaveBeenCalled();
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
});
