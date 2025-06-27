import fetchMock from "fetch-mock";

import { aiStreamingQuery, getInflightRequestsForUrl } from "./requests";
import { mockStreamedEndpoint } from "./test-utils";

const ENDPOINT = "/some-streamed-endpoint";

describe("ai requests", () => {
  describe("aiStreamingQuery", () => {
    it("should return full result of a successful request", async () => {
      mockStreamedEndpoint(ENDPOINT, {
        textChunks: whoIsYourFavoriteResponse,
      });
      const result = await aiStreamingQuery({ url: ENDPOINT, body: {} });
      expect(result).toMatchSnapshot();
    });

    it("should call callbacks for relevant chunk types", async () => {
      mockStreamedEndpoint(ENDPOINT, {
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

      mockStreamedEndpoint(ENDPOINT, {
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

    it("throw error if bad http status code", async () => {
      fetchMock.post(`path:${ENDPOINT}`, 500);
      await expect(
        aiStreamingQuery({ url: ENDPOINT, body: {} }),
      ).rejects.toThrow(/Response status: 500/);
    });

    it("throw error if no response", async () => {
      mockStreamedEndpoint(ENDPOINT, {
        textChunks: undefined,
      });
      await expect(
        aiStreamingQuery({ url: ENDPOINT, body: {} }),
      ).rejects.toThrow(/No response/);
    });

    it("should be able abort request via a passed in signal", async () => {
      const controller = new AbortController();

      fetchMock.post(`path:${ENDPOINT}`, { delay: 100, status: 200 });
      const promise = aiStreamingQuery({
        url: ENDPOINT,
        body: {},
        signal: controller.signal,
      });
      controller.abort();
      await expect(promise).rejects.toThrow(/The operation was aborted./);
    });

    describe("in-flight request tracking", () => {
      it("should register/unregister with inflight requests on a successful request", async () => {
        mockStreamedEndpoint(ENDPOINT, {
          textChunks: whoIsYourFavoriteResponse,
        });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(0);
        const promise = aiStreamingQuery({ url: ENDPOINT, body: {} });
        expect(getInflightRequestsForUrl(ENDPOINT).length).toBe(1);
        await promise;
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

const whoIsYourFavoriteResponse = [
  `0:"You, but don't tell anyone."`,
  `2:{"type":"state","version":1,"value":{"queries":{}}}`,
  `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
];
