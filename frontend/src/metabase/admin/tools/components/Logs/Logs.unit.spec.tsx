import fetchMock from "fetch-mock";
import type { Location } from "history";
import { Route } from "react-router";

import {
  act,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui-with-store";
import {
  createMockLocation,
  createMockRoutingState,
} from "metabase/redux/store/mocks";
import { UtilApi } from "metabase/services";

import { DEFAULT_POLLING_DURATION_MS, Logs } from "./Logs";
import { maybeMergeLogs } from "./utils";

const PATHNAME = "/admin/tools/logs";

const log = {
  timestamp: "2024-01-10T21:21:58.597Z",
  level: "DEBUG",
  fqns: "metabase.server.middleware.log",
  msg: "\u001B[32mGET /api/collection/root 200 17.6 ms (2 DB calls) App DB connections: 0/7 Jetty threads: 7/50 (1 idle, 0 queued) (42 total active threads) Queries in flight: 0 (0 queued)\u001B[0m",
  exception: null,
  process_uuid: "e7774ef2-42ab-43de-89f7-d6de9fdc624f",
};

let utilSpy: any;

interface SetupOpts {
  location?: Location;
}

async function setup({
  location = createMockLocation({
    pathname: PATHNAME,
  }),
}: SetupOpts = {}) {
  let renderResult: ReturnType<typeof renderWithProviders>;

  await act(async () => {
    renderResult = renderWithProviders(
      <Route path={location.pathname} component={() => <Logs />} />,
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
  });

  return renderResult!;
}

describe("Logs", () => {
  describe("log fetching", () => {
    beforeEach(() => {
      utilSpy = jest.spyOn(UtilApi, "logs");
      jest.useFakeTimers({ advanceTimers: true });
    });

    afterEach(() => {
      utilSpy.mockClear();
      jest.useRealTimers();
    });

    it("should call UtilApi.logs every 1 second", async () => {
      fetchMock.get("path:/api/logger/logs", []);
      await setup();
      await waitFor(() => {
        expect(utilSpy).toHaveBeenCalledTimes(1);
      });
    });

    it("should skip calls to UtilsApi.logs if last request is still in-flight", async () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
      fetchMock.get("path:/api/logger/logs", []);
      let resolve: any;
      utilSpy.mockReturnValueOnce(new Promise((res) => (resolve = res)));
      await setup();
      await waitFor(() => {
        expect(utilSpy).toHaveBeenCalledTimes(1);
      });
      act(() => {
        jest.advanceTimersByTime(DEFAULT_POLLING_DURATION_MS + 100);
      });
      expect(utilSpy).toHaveBeenCalledTimes(1); // should not have been called
      await act(async () => {
        resolve([log]);
      });
      await waitFor(() => {
        expect(screen.getByText(new RegExp(log.fqns))).toBeInTheDocument();
      });
      act(() => {
        jest.advanceTimersByTime(DEFAULT_POLLING_DURATION_MS + 100);
      });
      expect(utilSpy).toHaveBeenCalledTimes(2); // should have issued new request
      consoleWarn.mockRestore();
    });

    it("should display no results if there are no logs", async () => {
      fetchMock.get("path:/api/logger/logs", []);
      await setup();
      await waitFor(() => {
        expect(
          screen.getByText(`There's nothing here, yet.`),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /Download/ })).toBeDisabled();
    });

    it("should filter out logs not matching the query", async () => {
      fetchMock.get("path:/api/logger/logs", [log]);
      await setup({
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
      await setup({
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
      await setup();
      await waitFor(() => {
        expect(screen.getByText(new RegExp(log.fqns))).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /Download/ })).toBeEnabled();
    });

    it("should display server error message if an error occurs", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation();
      const errMsg = `An unexpected error occurred.`;
      fetchMock.get("path:/api/logger/logs", {
        status: 500,
        body: { message: errMsg },
      });
      await setup();
      await waitFor(() => {
        expect(screen.getByText(errMsg)).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("button", { name: /Download/ }),
      ).not.toBeInTheDocument();
      consoleError.mockRestore();
    });

    it("should stop polling on unmount", async () => {
      fetchMock.get("path:/api/logger/logs", [log]);
      const { unmount } = await setup();
      expect(await screen.findByText(new RegExp(log.fqns))).toBeInTheDocument();

      unmount();
      act(() => {
        jest.advanceTimersByTime(DEFAULT_POLLING_DURATION_MS + 100);
      });
      expect(utilSpy).toHaveBeenCalledTimes(1);
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
});
