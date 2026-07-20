import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { Location } from "history";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockLocation,
  createMockRoutingState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { openSaveDialog } from "metabase/utils/dom";

import { DEFAULT_POLLING_DURATION_MS, Logs } from "./Logs";
import { maybeMergeLogs } from "./utils";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  openSaveDialog: jest.fn(),
}));

// jest.mock replaces the module factory; retype the import as its mock
const mockOpenSaveDialog = openSaveDialog as jest.Mock;

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
      storeInitialState: {
        routing: createMockRoutingState({
          locationBeforeTransitions: location,
        }),
      },
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
    const readBlobText = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });

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

    beforeEach(() => {
      mockOpenSaveDialog.mockClear();
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

      expect(mockOpenSaveDialog).toHaveBeenCalledTimes(1);
      const [filename, blob] = mockOpenSaveDialog.mock.calls[0];
      expect(filename).toBe("logs.txt");
      // mock.calls args are untyped; the dialog is always called with a Blob
      const text = await readBlobText(blob as Blob);
      expect(text).toContain("[uuid-1]");
      expect(text).toContain("alpha-message");
      expect(text).not.toContain("beta-message");
    });
  });
});
