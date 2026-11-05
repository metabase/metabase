import type {
  MonitorRelayFeed,
  MonitorRelayFeedStatus,
  MonitorRelayNodeState,
  MonitorRelayStatus,
} from "metabase-types/api";

export const createMockMonitorRelayNodeState = (
  opts: Partial<MonitorRelayNodeState> = {},
): MonitorRelayNodeState => ({
  node_id: "node-a",
  ran_here: true,
  last_run_at: "2026-10-28T12:00:00Z",
  last_result: { outcome: "ok", message: "The last run succeeded." },
  failures: 0,
  ...opts,
});

export const createMockMonitorRelayFeedStatus = (
  opts: Partial<MonitorRelayFeedStatus> = {},
): MonitorRelayFeedStatus => ({
  phase: "live",
  last_seal_at: "2026-10-28T12:00:00Z",
  ...opts,
});

export const createMockMonitorRelayFeed = (
  opts: Partial<MonitorRelayFeed> = {},
): MonitorRelayFeed => ({
  at: "2026-10-28T12:00:00Z",
  error: null,
  status: createMockMonitorRelayFeedStatus(),
  ...opts,
});

export const createMockMonitorRelayStatus = (
  opts: Partial<MonitorRelayStatus> = {},
): MonitorRelayStatus => ({
  url: { status: "ok", base: "https://monitor.example.com" },
  node: createMockMonitorRelayNodeState(),
  feed: createMockMonitorRelayFeed(),
  ...opts,
});
