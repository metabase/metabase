/**
 * Row and scenario types shared by the harness packages (results, metrics, runner), plus the §4 metric
 * names. Dependency-free on purpose: importing it pulls in no runtime code.
 * Contract: `hackathon/harness/01-contracts.md` §3 (scenarios) and §4 (results schema).
 */

export type RunInfo = {
  gitSha?: string | null;
  branch?: string | null;
  dataScale?: number | null;
  corpusId?: string | null;
  host?: string | null;
  notes?: string | null;
  /** Axis 4: value of the search-embedding-text-variant setting at run start. Defaults to "baseline". */
  embeddingText?: string | null;
  /** The run's single embedder (§5.2). Optional: the writer stamps it from the first observation batch. */
  embedder?: string | null;
  /** Agent I's corpus text strategy (what was written into descriptions). Defaults to "none". */
  textStrategy?: string | null;
  /** runner/src/queue.ts job id (HARNESS_JOB_ID), when the run came from the queue. */
  jobId?: string | null;
};

/** One element of a ranked list. `name` is optional and only used by the drill-down. */
export type ReturnedItem = { model: string; id: number; name?: string | null; score?: number | null };

export type Scenario = {
  id: string;
  query: string;
  /** §3 tags, canonical: no leading ":" (normalise when loading scenarios, not here). */
  tags: string[];
  lang?: string | null;
  expected: { model: string; id: number; grade: number }[];
  expectedAbsent?: { model: string; id: number }[] | null;
  notes?: string | null;
};

export type QueryResultRow = {
  engine: string;
  embedder: string;
  dimensions?: number | null;
  scenarioId: string;
  iteration: number;
  latencyMs?: number | null;
  embedMs?: number | null;
  storeMs?: number | null;
  filterMs?: number | null;
  resultCount?: number | null;
  rawCount?: number | null;
  /** Rank order is array order. `null` when the query errored. */
  returned?: ReturnedItem[] | null;
  error?: string | Error | null;
};

export type MetricRow = {
  engine: string;
  /** Pairwise metrics only (jaccard@10, kendall_tau, rank_displacement): the engine compared against. */
  engineB?: string | null;
  embedder: string;
  scenarioId?: string | null;
  tag?: string | null;
  metric: string;
  /** Rows with a null/undefined value are skipped — an absent metric is not a zero. */
  value: number | null | undefined;
};

/** `harness_metric.metric` values (§4). The data app filters on these exact strings. */
export const METRIC = {
  recallAt10: "recall@10",
  precisionAt10: "precision@10",
  ndcgAt10: "ndcg@10",
  mrr: "mrr",
  zeroResultRate: "zero_result_rate",
  falsePositiveRate: "false_positive_rate",
  /** 0/1 per scenario with a non-empty expectedAbsent: 1 if any must-not-read item was returned. */
  permissionLeak: "permission_leak",
  /** 0/1 per scenario: 1 when every iteration errored, so the scenario is missing from the quality means. */
  unscoredRate: "unscored_rate",
  annRecallAt10: "ann_recall@10",
  jaccardAt10: "jaccard@10",
  kendallTau: "kendall_tau",
  kendallTauN: "kendall_tau_n",
  rankDisplacement: "rank_displacement",
  p50Ms: "p50_ms",
  p95Ms: "p95_ms",
  p99Ms: "p99_ms",
  embedShare: "embed_share",
  storeShare: "store_share",
  filterShare: "filter_share",
  otherShare: "other_share",
} as const;

/** Engine columns, in display order (§1). Heatmaps and drill-down columns are generated from this list. */
/** "semantic-pure" is the semantic engine booted with the appdb top-up disabled (runner --pure-vector); "semantic-vector"
 * also has its keyword arm off (runner --vector-only, BL-35). */
export const ENGINES = ["semantic", "semantic-pure", "semantic-vector", "sqlite-vec1", "sqlite-vec1-pure", "lucene", "lucene-pure", "appdb", "in-place"] as const;
export type Engine = (typeof ENGINES)[number];

/** Engines that never see embeddings: excluded from embedder-vs-engine comparisons, identical across variants. */
export const KEYWORD_ENGINES: readonly Engine[] = ["appdb", "in-place"];
export const isVectorEngine = (engine: string) => !(KEYWORD_ENGINES as readonly string[]).includes(engine);

/** Axis 4: values of the search-embedding-text-variant setting (Agent E). The first is the baseline. */
export const EMBEDDING_TEXT_VARIANTS = ["baseline", "context", "context-sql"] as const;
export type EmbeddingTextVariant = (typeof EMBEDDING_TEXT_VARIANTS)[number];

/** §3 scenario categories. */
export const CATEGORY_TAGS = [
  "paraphrase", "concept", "exact-name", "rare-token", "typo", "cross-lingual", "ambiguous", "empty-expected",
] as const;
export type CategoryTag = (typeof CATEGORY_TAGS)[number];
