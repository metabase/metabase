import fetchMock from "fetch-mock";

import api from "metabase/utils/api";

import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "./requests";
import type { SSEEvent } from "./sse-types";
import { mockStreamedEndpoint } from "./test-utils";

const endpoint = "/some-streamed-endpoint";
const fakeBasename = "http://example.com";
const originalBasename = api.basename;

describe("ai requests", () => {
  beforeAll(() => {
    api.basename = fakeBasename;
  });

  afterAll(() => {
    api.basename = originalBasename;
  });

  describe("aiStreamingQuery", () => {
    it("should call a request with a baseurl", async () => {
      const fetchSpy = jest.spyOn(global, "fetch");

      mockStreamedEndpoint(endpoint, {
        events: whoIsYourFavoriteResponse,
      });

      await aiStreamingQuery({ url: endpoint, body: {} });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://example.com/some-streamed-endpoint",
        expect.anything(),
      );

      fetchSpy.mockRestore();
    });

    it("should return full result of a successful request", async () => {
      mockStreamedEndpoint(endpoint, {
        events: whoIsYourFavoriteResponse,
      });
      const result = await aiStreamingQuery({ url: endpoint, body: {} });
      expect(result).toMatchSnapshot();
    });

    it("should call callbacks for relevant chunk types", async () => {
      mockStreamedEndpoint(endpoint, {
        events: [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Testing" },
          { type: "text-end", id: "t1" },
          { type: "data-state", id: "d1", data: {} },
          {
            type: "tool-input-available",
            toolCallId: "x",
            toolName: "x",
            input: { query: "test" },
          },
          {
            type: "tool-output-available",
            toolCallId: "x",
            output: { result: "ok" },
          },
        ],
      });

      const successCbs = {
        onTextPart: jest.fn(),
        onDataPart: jest.fn(),
        onToolInputAvailable: jest.fn(),
        onToolResultPart: jest.fn(),
        onError: jest.fn(),
      };

      await aiStreamingQuery({ url: endpoint, body: {} }, successCbs);
      expect(successCbs.onTextPart).toHaveBeenCalled();
      expect(successCbs.onDataPart).toHaveBeenCalled();
      expect(successCbs.onToolInputAvailable).toHaveBeenCalled();
      expect(successCbs.onToolResultPart).toHaveBeenCalled();
      expect(successCbs.onError).not.toHaveBeenCalled();

      mockStreamedEndpoint(endpoint, {
        events: [{ type: "error", errorText: "test error" }],
      });

      const failureCbs = {
        onError: jest.fn(),
      };
      try {
        await aiStreamingQuery({ url: endpoint, body: {} }, failureCbs);
      } catch (_) {}
      expect(failureCbs.onError).toHaveBeenCalled();
    });

    it("throw error if bad http status code", async () => {
      fetchMock.post(`path:${endpoint}`, 500);
      await expect(
        aiStreamingQuery({ url: endpoint, body: {} }),
      ).rejects.toThrow(/Response status: 500/);
    });

    it("throw error if no response", async () => {
      mockStreamedEndpoint(endpoint, {});
      await expect(
        aiStreamingQuery({ url: endpoint, body: {} }),
      ).rejects.toThrow(/No response/);
    });

    it("should be able abort request via a passed in signal", async () => {
      const controller = new AbortController();

      fetchMock.post(`path:${endpoint}`, { delay: 100, status: 200 });
      const promise = aiStreamingQuery({
        url: endpoint,
        body: {},
        signal: controller.signal,
      });
      controller.abort();
      await expect(promise).rejects.toThrow(/The operation was aborted./);
    });

    describe("in-flight request tracking", () => {
      it("should register/unregister with inflight requests on a successful request", async () => {
        mockStreamedEndpoint(endpoint, {
          events: whoIsYourFavoriteResponse,
        });
        expect(findMatchingInflightAiStreamingRequests(endpoint).length).toBe(
          0,
        );
        const promise = aiStreamingQuery({ url: endpoint, body: {} });
        expect(findMatchingInflightAiStreamingRequests(endpoint).length).toBe(
          1,
        );
        await promise;
        expect(findMatchingInflightAiStreamingRequests(endpoint).length).toBe(
          0,
        );
      });

      it("should properly unregister with inflight requests on abort", async () => {
        const controller = new AbortController();

        fetchMock.post(`path:${endpoint}`, { delay: 100, status: 200 });
        expect(findMatchingInflightAiStreamingRequests(endpoint).length).toBe(
          0,
        );
        const promise = aiStreamingQuery({
          url: endpoint,
          body: {},
          signal: controller.signal,
        });
        expect(findMatchingInflightAiStreamingRequests(endpoint).length).toBe(
          1,
        );
        controller.abort();
        expect(findMatchingInflightAiStreamingRequests(endpoint).length).toBe(
          0,
        );
        try {
          await promise;
        } catch (err) {}
      });
    });
  });
});

const whoIsYourFavoriteResponse: SSEEvent[] = [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "You, but don't tell anyone." },
  { type: "text-end", id: "t1" },
  { type: "data-state", id: "d1", data: { queries: {} } },
];
