import { act, render, screen, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { UtilApi } from "metabase/services";

import { Logs } from "./Logs";
import { maybeMergeLogs } from "./utils";

const log = {
  timestamp: "2024-01-10T21:21:58.597Z",
  level: "DEBUG",
  fqns: "metabase.server.middleware.log",
  msg: "\u001B[32mGET /api/collection/root 200 17.6 ms (2 DB calls) App DB connections: 0/7 Jetty threads: 7/50 (1 idle, 0 queued) (42 total active threads) Queries in flight: 0 (0 queued)\u001B[0m",
  exception: null,
  process_uuid: "e7774ef2-42ab-43de-89f7-d6de9fdc624f",
};

let utilSpy: any;

describe("Logs", () => {
  describe("log fetching", () => {
    beforeEach(() => {
      utilSpy = jest.spyOn(UtilApi, "logs");
      jest.useFakeTimers({ advanceTimers: true });
    });

    afterEach(() => {
      utilSpy.mockClear();
      fetchMock.restore();
      jest.useRealTimers();
    });

    it("should call UtilApi.logs every 1 second", async () => {
      fetchMock.get("path:/api/util/logs", []);
      render(<Logs />);
      await waitFor(() => [
        expect(screen.getByTestId("loading-spinner")).toBeInTheDocument(),
        expect(utilSpy).toHaveBeenCalledTimes(1),
      ]);
    });

    it("should skip calls to UtilsApi.logs if last request is still in-flight", async () => {
      fetchMock.get("path:/api/util/logs", []);
      let resolve: any;
      utilSpy.mockReturnValueOnce(new Promise(res => (resolve = res)));
      render(<Logs />);
      await waitFor(() => [
        expect(screen.getByTestId("loading-spinner")).toBeInTheDocument(),
        expect(utilSpy).toHaveBeenCalledTimes(1),
      ]);
      act(() => {
        jest.advanceTimersByTime(1100); // wait longer than polling period
      });
      expect(utilSpy).toHaveBeenCalledTimes(1); // should not have been called
      act(() => {
        resolve([log]);
      });
      await waitFor(() => {
        expect(
          screen.getByText(new RegExp(log.process_uuid)),
        ).toBeInTheDocument();
      });
      act(() => {
        jest.advanceTimersByTime(1100);
      });
      expect(utilSpy).toHaveBeenCalledTimes(2); // should have issued new request
    });

    it("should display no results if there are no logs", async () => {
      fetchMock.get("path:/api/util/logs", []);
      render(<Logs />);
      await waitFor(() => {
        expect(
          screen.getByText(`There's nothing here, yet.`),
        ).toBeInTheDocument();
      });
    });

    it("should display results if server responds with logs", async () => {
      fetchMock.get("path:/api/util/logs", [log]);
      render(<Logs />);
      await waitFor(() => {
        expect(
          screen.getByText(new RegExp(log.process_uuid)),
        ).toBeInTheDocument();
      });
    });

    it("should display server error message if an error occurs", async () => {
      const errMsg = `An unexpected error occured.`;
      fetchMock.get("path:/api/util/logs", {
        status: 500,
        body: { message: errMsg },
      });
      render(<Logs />);
      await waitFor(() => {
        expect(screen.getByText(errMsg)).toBeInTheDocument();
      });
    });
  });

  describe("log processing", () => {
    it("should skip updates if fetched logs match match previously requested logs", async () => {
      const originalLogs = [log];
      const shouldNotBeMerged = maybeMergeLogs(originalLogs, [log]);
      expect(shouldNotBeMerged).toBe(originalLogs);
      const shoudlBeMerged = maybeMergeLogs(originalLogs, [
        { ...log, msg: "different" },
      ]);
      expect(shoudlBeMerged).not.toBe(originalLogs);
    });
  });
});
