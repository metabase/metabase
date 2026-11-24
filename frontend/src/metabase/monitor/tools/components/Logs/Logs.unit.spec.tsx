import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { readBlobText, setupDownloadCapture } from "__support__/downloads";
import { createMockLocation } from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { dayjs } from "metabase/dayjs";
import type { Location } from "metabase/router";
import { Route } from "metabase/router";

import { DEFAULT_POLLING_DURATION_MS, Logs } from "./Logs";
import { maybeMergeLogs } from "./utils";

const PATHNAME = "/monitor/logs";

const log = {
  timestamp: "2024-01-10T21:21:58.597Z",
  level: "DEBUG",
  fqns: "metabase.server.middleware.log",
  msg: "\u001B[32mGET /api/collection/root 200 17.6 ms (2 DB calls) App DB connections: 0/7 Jetty threads: 7/50 (1 idle, 0 queued) (42 total active threads) Queries in flight: 0 (0 queued)\u001B[0m",
  exception: null,
  process_uuid: "e7774ef2-42ab-43de-89f7-d6de9fdc624f",
};

const countLogsCalls = () =>
  fetchMock.callHistory.calls("path:/api/logger/logs").length;

interface SetupOpts {
  location?: Location;
}

function setup({
  location = createMockLocation({
    pathname: PATHNAME,
  }),
}: SetupOpts = {}) {
  return renderWithProviders(
    <Route path={location.pathname} element={<Logs />} />,
    {
      initialRoute: `${location.pathname}${location.search}`,
      withRouter: true,
    },
  );
}

describe("Logs", () => {
  describe("log fetching", () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should fetch /api/logger/logs at least once on mount", async () => {
      fetchMock.get("path:/api/logger/logs", []);
      setup();
      await waitFor(() => {
        expect(countLogsCalls()).toBe(1);
      });
    });

    it("should skip log requests if last request is still in-flight", async () => {
      let resolveFirst: (logs: unknown) => void = () => {};
      let callCount = 0;
      fetchMock.get("path:/api/logger/logs", () => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<unknown>((res) => {
            resolveFirst = res;
          });
        }
        return [log];
      });
      setup();
      await waitFor(() => {
        expect(countLogsCalls()).toBe(1);
      });
      act(() => {
        jest.advanceTimersByTime(DEFAULT_POLLING_DURATION_MS + 100);
      });
      expect(countLogsCalls()).toBe(1); // should not have been called
      act(() => {
        resolveFirst([log]);
      });
      await waitFor(() => {
        expect(screen.getByText(new RegExp(log.fqns))).toBeInTheDocument();
      });
      act(() => {
        jest.advanceTimersByTime(DEFAULT_POLLING_DURATION_MS + 100);
      });
      await waitFor(() => {
        expect(countLogsCalls()).toBe(2); // should have issued new request
      });
    });

    it("should display no results if there are no logs", async () => {
      fetchMock.get("path:/api/logger/logs", []);
      setup();
      await waitFor(() => {
        expect(
          screen.getByText(`There's nothing here, yet.`),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /Download/ })).toBeDisabled();
    });

    it("should filter out logs not matching the query", async () => {
      fetchMock.get("path:/api/logger/logs", [log]);
      setup({
        location: createMockLocation({
          pathname: PATHNAME,
          search: "?query=something",
        }),
      });
      await waitFor(() => {
        expect(
          screen.getByText("Nothing matches your filters."),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /Download/ })).toBeDisabled();
    });

    it("should not filter out logs matching the query", async () => {
      fetchMock.get("path:/api/logger/logs", [log]);
      setup({
        location: createMockLocation({
          pathname: PATHNAME,
          search: `?query=${log.fqns}`,
        }),
      });
      expect(await screen.findByText(new RegExp(log.fqns))).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Download/ })).toBeEnabled();
    });

    it("should display results if server responds with logs", async () => {
      fetchMock.get("path:/api/logger/logs", [log]);
      setup();
      expect(await screen.findByText(new RegExp(log.fqns))).toBeInTheDocument();
      // The log message is wrapped in a green ANSI escape sequence
      expect(screen.getByText(/GET \/api\/collection\/root/)).toHaveClass(
        "react-ansi-style-green",
      );
      expect(screen.getByRole("button", { name: /Download/ })).toBeEnabled();
    });

    it("should display server error message if an error occurs", async () => {
      const errMsg = `An unexpected error occurred.`;
      fetchMock.get("path:/api/logger/logs", {
        status: 500,
        body: { message: errMsg },
      });
      setup();
      await waitFor(() => {
        expect(screen.getByText(errMsg)).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("button", { name: /Download/ }),
      ).not.toBeInTheDocument();
    });

    it("should stop polling on unmount", async () => {
      fetchMock.get("path:/api/logger/logs", [log]);
      const { unmount } = setup();
      expect(await screen.findByText(new RegExp(log.fqns))).toBeInTheDocument();

      unmount();
      act(() => {
        jest.advanceTimersByTime(DEFAULT_POLLING_DURATION_MS + 100);
      });
      expect(countLogsCalls()).toBe(1);
    });
  });

  describe("log processing", () => {
    it("should skip updates if fetched logs match match previously requested logs", async () => {
      const originalLogs = [log];
      const shouldNotBeMerged = maybeMergeLogs(originalLogs, [log]);
      expect(shouldNotBeMerged).toBe(originalLogs);
      const shouldBeMerged = maybeMergeLogs(originalLogs, [
        { ...log, msg: "different" },
      ]);
      expect(shouldBeMerged).not.toBe(originalLogs);
    });
  });

  describe("download", () => {
    const alpha = {
      ...log,
      process_uuid: "uuid-1",
      fqns: "metabase.alpha",
      msg: "alpha-message",
    };
    const beta = {
      ...log,
      process_uuid: "uuid-2",
      fqns: "metabase.beta",
      msg: "beta-message",
    };

    let downloadCapture: ReturnType<typeof setupDownloadCapture>;

    beforeEach(() => {
      downloadCapture = setupDownloadCapture();
    });

    afterEach(() => {
      downloadCapture.restore();
    });

    it("downloads only the currently filtered logs, prefixed by process UUID", async () => {
      fetchMock.get("path:/api/logger/logs", [alpha, beta]);
      setup({
        location: createMockLocation({
          pathname: PATHNAME,
          search: "?query=alpha-message",
        }),
      });

      const downloadButton = await screen.findByRole("button", {
        name: /Download/,
      });
      await waitFor(() => expect(downloadButton).toBeEnabled());
      await userEvent.click(downloadButton);

      expect(downloadCapture.downloads).toHaveLength(1);
      const [download] = downloadCapture.downloads;
      expect(download.fileName).toBe("logs.txt");
      const text = await readBlobText(download.blob);
      expect(text).toContain("[uuid-1]");
      expect(text).toContain("alpha-message");
      expect(text).not.toContain("beta-message");
    });

    it("downloads all logs, then only the logs matching the typed filter", async () => {
      const debugLog = {
        timestamp: "2024-01-10T21:21:58.597Z",
        level: "DEBUG",
        fqns: "metabase.server.middleware.log",
        msg: "message",
        exception: null,
        process_uuid: "e7774ef2-42ab-43de-89f7-d6de9fdc624f",
      };
      const errorLog = {
        ...debugLog,
        process_uuid: "9da436dc-d79c-42f9-89e3-322c22cd0cd3",
        timestamp: "2024-01-10T21:21:58.598Z",
        level: "ERROR",
      };
      // the formatted timestamp depends on the timezone the test runs in
      const formatTimestamp = (timestamp: string) => dayjs(timestamp).format();
      const debugLine = `[e7774ef2-42ab-43de-89f7-d6de9fdc624f] ${formatTimestamp(debugLog.timestamp)} DEBUG metabase.server.middleware.log message`;
      const errorLine = `[9da436dc-d79c-42f9-89e3-322c22cd0cd3] ${formatTimestamp(errorLog.timestamp)} ERROR metabase.server.middleware.log message`;
      fetchMock.get("path:/api/logger/logs", [debugLog, errorLog]);
      setup();

      const downloadButton = await screen.findByRole("button", {
        name: /Download/,
      });
      await waitFor(() => expect(downloadButton).toBeEnabled());
      await userEvent.click(downloadButton);

      expect(downloadCapture.downloads).toHaveLength(1);
      const [allLogsDownload] = downloadCapture.downloads;
      expect(allLogsDownload.fileName).toBe("logs.txt");
      expect(allLogsDownload.href).toMatch(/^blob:/);
      expect(await readBlobText(allLogsDownload.blob)).toBe(
        [debugLine, errorLine].join("\n"),
      );

      await userEvent.type(screen.getByPlaceholderText("Filter logs"), "error");
      await userEvent.click(screen.getByRole("button", { name: /Download/ }));

      expect(downloadCapture.downloads).toHaveLength(2);
      const filteredDownload = downloadCapture.downloads[1];
      expect(filteredDownload.fileName).toBe("logs.txt");
      expect(filteredDownload.href).toMatch(/^blob:/);
      expect(await readBlobText(filteredDownload.blob)).toBe(errorLine);
    });
  });
});
