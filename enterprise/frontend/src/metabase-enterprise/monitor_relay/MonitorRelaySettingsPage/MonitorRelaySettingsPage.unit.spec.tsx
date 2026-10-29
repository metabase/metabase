import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupMonitorRelayStatusEndpoint,
  setupMonitorRelayStatusErrorEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import type {
  MonitorRelayFeedStatus,
  MonitorRelayStatus,
} from "metabase-types/api";
import {
  createMockMonitorRelayFeed,
  createMockMonitorRelayFeedStatus,
  createMockMonitorRelayNode,
  createMockMonitorRelayNodeState,
  createMockMonitorRelayStateKind,
  createMockMonitorRelayStatus,
  createMockMonitorRelayStream,
  createMockMonitorRelayUrl,
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
  isEnvSetting?: boolean;
}

const setup = async ({
  status = createMockMonitorRelayStatus(),
  hasStatusError = false,
  isEnvSetting = false,
}: SetupOpts = {}) => {
  const settings = createMockSettings();
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "metabase-monitor-url",
      value: isEnvSetting ? null : MASKED_URL,
      is_env_setting: isEnvSetting,
      env_name: "MB_METABASE_MONITOR_URL",
    }),
  ]);
  setupUpdateSettingEndpoint();
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

const REFUSED =
  "Metabase Monitor at https://monitor.example.com refused the relay's token. The relay tries again in 5 minutes, or when its URL changes.";

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

    it("saves a new URL through the settings API when Save is clicked", async () => {
      await setup();

      const input = screen.getByLabelText("Ingestion URL");
      await userEvent.clear(input);
      await userEvent.type(input, "https://monitor.example.com/ingest/abc");
      await userEvent.tab();
      expect(await findRequests("PUT")).toHaveLength(0);

      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toContain("/api/setting/metabase-monitor-url");
      expect(puts[0].body).toEqual({
        value: "https://monitor.example.com/ingest/abc",
      });
    });

    it("can save only a changed value", async () => {
      await setup();

      const save = screen.getByRole("button", { name: "Save changes" });
      expect(save).toBeDisabled();

      const input = screen.getByLabelText("Ingestion URL");
      await userEvent.type(input, "x");
      expect(save).toBeEnabled();
      await userEvent.type(input, "{backspace}");
      expect(save).toBeDisabled();
    });

    it("clears the URL when it is emptied and saved", async () => {
      await setup();

      await userEvent.clear(screen.getByLabelText("Ingestion URL"));
      await userEvent.click(
        screen.getByRole("button", { name: "Save changes" }),
      );

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({ value: "" });
    });

    it("is read-only when the environment sets it", async () => {
      await setup({ isEnvSetting: true });

      expect(
        await screen.findByText(/This has been set by the/),
      ).toBeInTheDocument();
      expect(screen.getByText("MB_METABASE_MONITOR_URL")).toBeInTheDocument();
      expect(screen.queryByLabelText("Ingestion URL")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save changes" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("status", () => {
    it("says so when no URL is set", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          url: createMockMonitorRelayUrl({ status: "unset", base: null }),
          feed: NO_FEED,
        }),
      });

      expect(
        await screen.findByText(
          "No URL is set, so this instance sends nothing.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("This node")).not.toBeInTheDocument();
    });

    it("says so when the environment sets a URL of another form", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          url: createMockMonitorRelayUrl({ status: "malformed", base: null }),
          feed: NO_FEED,
        }),
      });

      expect(
        await screen.findByText(
          "MB_METABASE_MONITOR_URL is not of the form <base>/ingest/<token>, so this instance sends nothing.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("This node")).not.toBeInTheDocument();
    });

    it("shows this node's last result before Metabase Monitor answers", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          node: createMockMonitorRelayNodeState({
            last_result: { outcome: "refused", message: REFUSED },
            failures: 3,
            paused_until: new Date(Date.now() + 5 * 60_000).toISOString(),
          }),
          feed: NO_FEED,
        }),
      });

      expect(
        await screen.findByText("Metabase Monitor has not answered yet."),
      ).toBeInTheDocument();
      expect(screen.getByText(REFUSED)).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(
        screen.getByText("Paused. It tries again in 5 minutes."),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Sends to https://monitor.example.com."),
      ).toBeInTheDocument();
    });

    it("shows the error when Metabase Monitor cannot be reached", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          feed: createMockMonitorRelayFeed({
            status: null,
            error: "Connection refused",
          }),
        }),
      });

      expect(
        await screen.findByText(
          "Could not get the status from Metabase Monitor.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Connection refused")).toBeInTheDocument();
      expect(
        screen.queryByText("Metabase Monitor has not answered yet."),
      ).not.toBeInTheDocument();
      expect(screen.getByText("This node")).toBeInTheDocument();
    });

    it("shows when this node last ran the job", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          node: createMockMonitorRelayNodeState({
            ran_here: true,
            last_run_at: minutesAgo(0.5),
          }),
        }),
      });

      expect(await screen.findByText("Last run")).toBeInTheDocument();
      expect(screen.getByText("a few seconds ago")).toBeInTheDocument();
      expect(
        screen.queryByText(
          "Another node may run the job, or this node's scheduler is off.",
        ),
      ).not.toBeInTheDocument();
    });

    it("says why this node has not run the job in the last minute", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          node: createMockMonitorRelayNodeState({
            ran_here: false,
            last_run_at: null,
          }),
        }),
      });

      expect(await screen.findByText("Last run")).toBeInTheDocument();
      expect(screen.getByText("Never")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Another node may run the job, or this node's scheduler is off.",
        ),
      ).toBeInTheDocument();
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
    });

    it("says when Metabase Monitor has processed nothing yet", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          feed: feedWith({ phase: "loading", last_seal_at: null }),
        }),
      });

      expect(await screen.findByText("Last processed")).toBeInTheDocument();
      expect(screen.getByText("Never")).toBeInTheDocument();
    });

    it("shows each stream's ids and history progress", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          feed: feedWith({
            phase: "loading",
            streams: [
              createMockMonitorRelayStream({
                stream: "login",
                w: 150,
                sequence: 1200,
                floor: 101,
                target: 200,
              }),
              createMockMonitorRelayStream({
                stream: "execution",
                w: null,
                sequence: 5000,
                floor: null,
                target: null,
              }),
            ],
          }),
        }),
      });

      expect(await screen.findByText("Loading history")).toBeInTheDocument();

      const loginRow = screen.getByRole("row", { name: /Logins/ });
      expect(within(loginRow).getByText("150")).toBeInTheDocument();
      expect(within(loginRow).getByText("1,200")).toBeInTheDocument();
      expect(within(loginRow).getByText("50%")).toBeInTheDocument();

      const executionRow = screen.getByRole("row", {
        name: /Query executions/,
      });
      expect(within(executionRow).getByText("Unknown")).toBeInTheDocument();
      expect(within(executionRow).getByText("5,000")).toBeInTheDocument();
      expect(within(executionRow).getByText("Not started")).toBeInTheDocument();
    });

    it("shows each kind of state's last full read, its interval, and when user and card changes were read", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          feed: feedWith({
            state: [
              createMockMonitorRelayStateKind({
                kind: "card",
                pass_age_s: 7200,
                interval_s: 86400,
                cursor_age_s: 4,
              }),
              {
                kind: "field",
                pass_age_s: null,
                interval_s: 3600,
              },
              createMockMonitorRelayStateKind({
                kind: "user",
                pass_age_s: 60,
                interval_s: 86400,
                cursor_age_s: null,
              }),
            ],
          }),
        }),
      });

      expect(await screen.findByText("State")).toBeInTheDocument();

      const cardRow = screen.getByRole("row", { name: /Cards/ });
      expect(within(cardRow).getByText("2 hours ago")).toBeInTheDocument();
      expect(within(cardRow).getByText("24 hours")).toBeInTheDocument();
      expect(within(cardRow).getByText("4 seconds ago")).toBeInTheDocument();

      const fieldRow = screen.getByRole("row", { name: /Fields/ });
      expect(within(fieldRow).getByText("Never")).toBeInTheDocument();
      expect(within(fieldRow).getByText("1 hour")).toBeInTheDocument();
      expect(within(fieldRow).queryByText("Not yet")).not.toBeInTheDocument();

      const userRow = screen.getByRole("row", { name: /Users/ });
      expect(within(userRow).getByText("1 minute ago")).toBeInTheDocument();
      expect(within(userRow).getByText("Not yet")).toBeInTheDocument();
    });

    it("shows each node's last call, newest first, and marks this node", async () => {
      await setup({
        status: createMockMonitorRelayStatus({
          node: createMockMonitorRelayNodeState({ node_id: "node-a" }),
          feed: feedWith({
            nodes: [
              createMockMonitorRelayNode({
                node_id: "node-b",
                last_sync_at: minutesAgo(1),
              }),
              createMockMonitorRelayNode({
                node_id: "node-a",
                last_sync_at: minutesAgo(3),
              }),
            ],
          }),
        }),
      });

      const [newestRow, olderRow] = await screen.findAllByRole("row", {
        name: /node-/,
      });
      expect(within(newestRow).getByText("node-b")).toBeInTheDocument();
      expect(within(newestRow).getByText("a minute ago")).toBeInTheDocument();
      expect(
        within(olderRow).getByText("node-a (this node)"),
      ).toBeInTheDocument();
      expect(within(olderRow).getByText("3 minutes ago")).toBeInTheDocument();
      expect(screen.queryByText("Lease holder")).not.toBeInTheDocument();
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
