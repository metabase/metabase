export type MonitorRelayPhase = "waiting" | "loading" | "sealing" | "live";

export type MonitorRelayStream = {
  stream: string;
  /** The id up to which Metabase Monitor has every row. */
  w: number | null;
  /**
   * The highest id the application database has given out, or null when
   * unknown.
   */
  sequence: number | null;
  /**
   * The first id Metabase Monitor takes from this stream, or null before it
   * sets one.
   */
  floor: number | null;
  /**
   * The history's last id, or null before the floor. Always null for the
   * change stream, which has no history.
   */
  target: number | null;
};

export type MonitorRelayNode = {
  node_id: string;
  last_sync_at: string;
};

/** How Metabase Monitor's copy of one kind of state stands. */
export type MonitorRelayStateKind = {
  kind: string;
  /** Seconds since its full read began, or null before it. */
  snapshot_age_s: number | null;
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
