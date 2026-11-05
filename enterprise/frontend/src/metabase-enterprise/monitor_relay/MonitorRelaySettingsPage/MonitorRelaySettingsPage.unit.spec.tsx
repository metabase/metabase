import {
  setupMonitorRelayStatusEndpoint,
  setupMonitorRelayStatusErrorEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { act, renderWithProviders, screen } from "__support__/ui";
import type {
  MonitorRelayFeedStatus,
  MonitorRelayStatus,
} from "metabase-types/api";
import {
  createMockMonitorRelayFeed,
  createMockMonitorRelayFeedStatus,
  createMockMonitorRelayNodeState,
  createMockMonitorRelayStatus,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { MonitorRelaySettingsPage } from "./MonitorRelaySettingsPage";
import { STATUS_POLLING_INTERVAL_MS } from "./utils";

const MASKED_URL = "**********Xk";

interface SetupOpts {
  status?: MonitorRelayStatus;
  hasStatusError?: boolean;
}

const setup = async ({
  status = createMockMonitorRelayStatus(),
  hasStatusError = false,
}: SetupOpts = {}) => {
  const settings = createMockSettings();
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "metabase-monitor-url",
      env_name: "MB_METABASE_MONITOR_URL",
      value: MASKED_URL,
    }),
  ]);
  if (hasStatusError) {
    setupMonitorRelayStatusErrorEndpoint();
  } else {
    setupMonitorRelayStatusEndpoint(status);
  }

  renderWithProviders(<MonitorRelaySettingsPage />, {
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: true }),
      settings: createMockSettingsState(settings),
    },
  });

  await screen.findByText("Ingestion URL");
};

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const NO_FEED = createMockMonitorRelayFeed({ at: null, status: null });

const CHANGE_LOG_REFUSED =
  "Metabase Monitor at https://monitor.example.com refused this relay: settings.change_log is false: Metabase does not log its changes. It needs the change log's licence feature (change-log). The relay tries again in 5 minutes, or when its URL changes.";

const feedWith = (opts: Partial<MonitorRelayFeedStatus>) =>
  createMockMonitorRelayFeed({
    status: createMockMonitorRelayFeedStatus(opts),
  });

describe("MonitorRelaySettingsPage", () => {
  describe("ingestion URL", () => {
    it("shows the URL masked", async () => {
      await setup();

      const input = screen.getByLabelText("Ingestion URL");
      expect(input).toHaveAttribute("type", "password");
      expect(input).toHaveValue(MASKED_URL);
    });
  });

  describe("status", () => {
    it("says so when no URL is set", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          url: { status: "unset", base: null },
          feed: NO_FEED,
        }),
      });

      expect(
        await screen.findByText(
          "No URL is set, so this instance sends nothing.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Phase")).not.toBeInTheDocument();
    });

    it("says so when the environment sets a URL of another form", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          url: { status: "malformed", base: null },
          feed: NO_FEED,
        }),
      });

      expect(
        await screen.findByText(
          "MB_METABASE_MONITOR_URL is not of the form <base>/ingest/<token>, so this instance sends nothing.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Phase")).not.toBeInTheDocument();
    });

    it("shows the phase, and when Metabase Monitor last processed the rows", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          feed: feedWith({ phase: "live", last_seal_at: minutesAgo(2) }),
        }),
      });

      expect(await screen.findByText("Live")).toBeInTheDocument();
      expect(screen.getByText("Last processed")).toBeInTheDocument();
      expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
      expect(
        screen.queryByText("The last run succeeded."),
      ).not.toBeInTheDocument();
    });

    it("says when Metabase Monitor has processed nothing yet", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          feed: feedWith({ phase: "loading", last_seal_at: null }),
        }),
      });

      expect(await screen.findByText("Loading history")).toBeInTheDocument();
      expect(screen.getByText("Never")).toBeInTheDocument();
    });

    it("shows this node's last failure before the phase", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          node: createMockMonitorRelayNodeState({
            last_result: { outcome: "refused", message: CHANGE_LOG_REFUSED },
            failures: 1,
          }),
          feed: feedWith({ phase: "live" }),
        }),
      });

      const refusal = await screen.findByText(CHANGE_LOG_REFUSED);
      expect(
        refusal.compareDocumentPosition(screen.getByText("Live")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("says why it has no status from Metabase Monitor", async () => {
      const error =
        "The relay could not reach Metabase Monitor at https://monitor.example.com: ConnectException: Connection refused.";
      await setup({
        status: createMockMonitorRelayStatus({
          feed: createMockMonitorRelayFeed({ status: null, error }),
        }),
      });

      expect(await screen.findByText(error)).toBeInTheDocument();
      expect(screen.queryByText("Phase")).not.toBeInTheDocument();
    });

    it("shows an error when the status cannot be read", async () => {
      await setup({ hasStatusError: true });

      expect(await screen.findByText(/An error occurred/)).toBeInTheDocument();
    });

    it("reads the status again every 10 seconds", async () => {
      jest.useFakeTimers({ advanceTimers: true });

      try {
        await setup({
          status: createMockMonitorRelayStatus({
            feed: feedWith({ phase: "loading" }),
          }),
        });
        expect(await screen.findByText("Loading history")).toBeInTheDocument();

        setupMonitorRelayStatusEndpoint(
          createMockMonitorRelayStatus({
            feed: feedWith({ phase: "live" }),
          }),
        );
        act(() => {
          jest.advanceTimersByTime(STATUS_POLLING_INTERVAL_MS);
        });

        expect(await screen.findByText("Live")).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
