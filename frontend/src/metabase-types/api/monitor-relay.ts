export type MonitorRelayPhase = "waiting" | "loading" | "sealing" | "live";

export type MonitorRelayStream = {
  stream: string;
  w: number | null;
  sequence: number | null;
  floor: number | null;
  target: number | null;
};

export type MonitorRelayNode = {
  node_id: string;
  last_sync_at: string;
};

/** How Metabase Monitor's copy of one kind of state stands. */
export type MonitorRelayStateKind = {
  kind: string;
  /** Seconds since its last full read began, or null before the first. */
  pass_age_s: number | null;
  /** How often Metabase Monitor reads it in full, in seconds. */
  interval_s: number;
  /**
   * Only for the kinds whose changes are also read, users and cards: seconds
   * since their changes were last read, or null before the first read.
   */
  cursor_age_s?: number | null;
};

/** What Metabase Monitor answers to `POST /ingest/v1/status`. */
export type MonitorRelayFeedStatus = {
  phase: MonitorRelayPhase;
  streams: MonitorRelayStream[];
  last_seal_at: string | null;
  nodes: MonitorRelayNode[];
  state: MonitorRelayStateKind[];
};

/**
 * The status this node asked Metabase Monitor for: `status`, or why there is
 * none, `error`, and when it asked, `at`.
 */
export type MonitorRelayFeed = {
  at: string | null;
  error: string | null;
  status: MonitorRelayFeedStatus | null;
};

export type MonitorRelayUrl = {
  status: "ok" | "unset" | "malformed";
  base: string | null;
};

export type MonitorRelayOutcome =
  | "ok"
  | "stale"
  | "refused"
  | "busy"
  | "failed";

export type MonitorRelayResult = {
  outcome: MonitorRelayOutcome;
  message: string;
};

export type MonitorRelayNodeState = {
  node_id: string;
  ran_here: boolean;
  last_run_at: string | null;
  last_result: MonitorRelayResult | null;
  failures: number;
  paused_until: string | null;
};

export type MonitorRelayStatus = {
  url: MonitorRelayUrl;
  node: MonitorRelayNodeState;
  feed: MonitorRelayFeed;
};
