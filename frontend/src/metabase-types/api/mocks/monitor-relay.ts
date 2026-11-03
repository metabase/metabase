import type {
  MonitorRelayFeed,
  MonitorRelayFeedStatus,
  MonitorRelayNode,
  MonitorRelayNodeState,
  MonitorRelayStateKind,
  MonitorRelayStatus,
  MonitorRelayStream,
  MonitorRelayUrl,
} from "metabase-types/api";

export const createMockMonitorRelayUrl = (
  opts: Partial<MonitorRelayUrl> = {},
): MonitorRelayUrl => ({
  status: "ok",
  base: "https://monitor.example.com",
  ...opts,
});

export const createMockMonitorRelayNodeState = (
  opts: Partial<MonitorRelayNodeState> = {},
): MonitorRelayNodeState => ({
  node_id: "node-a",
  ran_here: true,
  last_run_at: "2026-10-28T12:00:00Z",
  last_result: { outcome: "ok", message: "The run had no failure." },
  failures: 0,
  paused_until: null,
  ...opts,
});

export const createMockMonitorRelayStream = (
  opts: Partial<MonitorRelayStream> = {},
): MonitorRelayStream => ({
  stream: "execution",
  w: 100,
  sequence: 100,
  floor: 1,
  target: 100,
  ...opts,
});

export const createMockMonitorRelayNode = (
  opts: Partial<MonitorRelayNode> = {},
): MonitorRelayNode => ({
  node_id: "node-a",
  last_sync_at: "2026-10-28T12:00:00Z",
  ...opts,
});

export const createMockMonitorRelayStateKind = (
  opts: Partial<MonitorRelayStateKind> = {},
): MonitorRelayStateKind => ({
  kind: "user",
  snapshot_age_s: 3600,
  ...opts,
});

export const createMockMonitorRelayFeedStatus = (
  opts: Partial<MonitorRelayFeedStatus> = {},
): MonitorRelayFeedStatus => ({
  phase: "live",
  streams: [createMockMonitorRelayStream()],
  last_seal_at: "2026-10-28T12:00:00Z",
  nodes: [createMockMonitorRelayNode()],
  state: [createMockMonitorRelayStateKind()],
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
  url: createMockMonitorRelayUrl(),
  node: createMockMonitorRelayNodeState(),
  feed: createMockMonitorRelayFeed(),
  ...opts,
});
