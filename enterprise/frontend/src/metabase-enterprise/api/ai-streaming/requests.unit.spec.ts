import fetchMock from "fetch-mock";

import { aiStreamingQuery, getInflightRequestsForUrl } from "./requests";
import { mockStreamedEndpoint } from "./test-utils";

const ENDPOINT = "/some-streamed-endpoint";

describe("ai requests", () => {
  describe("aiStreamingQuery", () => {
    it("should return full result of a successful request", async () => {
      mockStreamedEndpoint({
        url: ENDPOINT,
        textChunks: whoIsYourFavoriteResponse,
      });
      const result = await aiStreamingQuery({ url: ENDPOINT, body: {} });

      // TODO: make a snapshot test
      expect(result).toEqual({
        data: [{ type: "state", value: { queries: {} }, version: 1 }],
        history: [
          { content: "You, but don't tell anyone.", role: "assistant" },
        ],
        parts: [
          { code: "0", name: "text", value: "You, but don't tell anyone." },
          {
            code: "2",
            name: "data",
            value: { type: "state", value: { queries: {} }, version: 1 },
          },
          {
            code: "d",
            name: "finish_message",
            value: {
              finishReason: "stop",
              usage: { completionTokens: 8, promptTokens: 4916 },
            },
          },
        ],
        text: "You, but don't tell anyone.",
        toolCalls: [],
      });
    });

    it("should call callbacks for relevant chunk types", async () => {
      mockStreamedEndpoint({
        url: ENDPOINT,
        textChunks: [
          `0:"Testing"`,
          `2:{"type":"state","version":1,"value":{}}`,
          `9:{"toolCallId":"x","toolName":"x","args":""}`,
          `a:{"toolCallId":"x","result":""}`,
          `d:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}`,
        ],
      });

      const successCbs = {
        onTextPart: jest.fn(),
        onDataPart: jest.fn(),
        onToolCallPart: jest.fn(),
        onToolResultPart: jest.fn(),
        onError: jest.fn(),
      };

      await aiStreamingQuery({ url: ENDPOINT, body: {} }, successCbs);
      expect(successCbs.onTextPart).toHaveBeenCalled();
      expect(successCbs.onDataPart).toHaveBeenCalled();
      expect(successCbs.onToolCallPart).toHaveBeenCalled();
      expect(successCbs.onToolResultPart).toHaveBeenCalled();
      expect(successCbs.onError).not.toHaveBeenCalled();

      mockStreamedEndpoint({
        url: ENDPOINT,
        textChunks: [
          `3:{}`, // error after finish to trigger all callbacks
        ],
      });

      const failureCbs = {
        onError: jest.fn(),
      };
      try {
        await aiStreamingQuery({ url: ENDPOINT, body: {} }, failureCbs);
      } catch (_) {}
      expect(failureCbs.onError).toHaveBeenCalled();
    });

    it.todo("should be able abort request via a passed in signal");

    describe("in-flight request tracking", () => {
      it("should register/unregister with inflight requests on a successful request", async () => {
        mockStreamedEndpoint({
          url: ENDPOINT,
          textChunks: whoIsYourFavoriteResponse,
        });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(0);
        const promise = aiStreamingQuery({ url: ENDPOINT, body: {} });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(1);
        await promise;
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(0);
      });

      it("should properly unregister with inflight requests on error", async () => {
        mockStreamedEndpoint({
          url: ENDPOINT,
          textChunks: [`3:{}`], // error message
        });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(0);
        const promise = aiStreamingQuery({ url: ENDPOINT, body: {} });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(1);

        await expect(promise).rejects.not.toBeFalsy();

        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(0);
      });

      it("should properly unregister with inflight requests on abort", async () => {
        const controller = new AbortController();

        fetchMock.post(`path:${ENDPOINT}`, { delay: 100, status: 200 });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(0);
        const promise = aiStreamingQuery({
          url: ENDPOINT,
          body: {},
          signal: controller.signal,
        });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(1);
        controller.abort();
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(0);
        try {
          await promise;
        } catch (err) {}
      });
    });
  });
});

// TODO: find a common place for fixtures
const whoIsYourFavoriteResponse = [
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];
