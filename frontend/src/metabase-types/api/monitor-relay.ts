export type MonitorRelayPhase = "waiting" | "loading" | "sealing" | "live";

/** What Metabase Monitor answers to `POST /ingest/v1/status`. */
export type MonitorRelayFeedStatus = {
  phase: MonitorRelayPhase;
  last_seal_at: string | null;
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

export type MonitorRelayUrl =
  | { status: "ok"; base: string }
  | { status: "unset"; base: null }
  | { status: "malformed"; base: null };

export type MonitorRelayOutcome = "ok" | "refused" | "busy" | "failed";

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
};

export type MonitorRelayStatus = {
  url: MonitorRelayUrl;
  node: MonitorRelayNodeState;
  feed: MonitorRelayFeed;
};
