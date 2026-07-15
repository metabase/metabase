import type { CardId } from "./card";
import type { Collection, CollectionId } from "./collection";
import type { DimensionId, DimensionMapping, MetricDimension } from "./measure";
import type { Metric } from "./metric";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery } from "./query";
import type { SegmentId } from "./segment";
import type { Timeline, TimelineEvent, TimelineId } from "./timeline";
import type { UserId } from "./user";

export type GetExplorationDataRequest = {
  q?: string;
};

export type ExplorationDimensionGroup = {
  name: string;
  dimension_interestingness: number | null;
  dimensions: MetricDimension[];
};

export type ExplorationMetric = Metric & {
  dimension_ids: DimensionId[];
  in_library?: boolean;
};

export type GetExplorationDataResponse = {
  metrics: ExplorationMetric[];
  dimension_groups: ExplorationDimensionGroup[];
};

// One group Metabot authored via the `add_research_groups` tool: either a metric sliced by chosen
// dimensions, or a dimension slicing a chosen set of (by default, all) related metrics.
export type ResearchGroupSpec =
  | {
      anchor: "metric";
      metric_id: number;
      dimension_ids?: DimensionId[];
      // When true, slice the metric by exactly `dimension_ids` instead of adding them on top of
      // the automatically-selected interesting dimensions.
      replace_default_dimensions?: boolean;
    }
  | {
      anchor: "dimension";
      dimension_id: DimensionId;
      // When present, include only these metrics instead of every related metric.
      metric_ids?: number[];
    };

// Result of the `add_research_groups` tool: the picker hydration for the referenced metrics, plus
// the validated group specs the chat handler turns into picker blocks.
export type AddResearchGroupsResponse = GetExplorationDataResponse & {
  groups: ResearchGroupSpec[];
};

// The draft Research plan the front-end serializes into Metabot's chat context each turn, so the
// agent can read what's currently in the plan and edit it. Plan-only: just the selected members,
// not the unselected candidates (the agent gets those from `get_research_candidates`).
export type ResearchPlanMetricRef = { id: number; name: string };
export type ResearchPlanDimensionRef = { id: DimensionId; name: string };
export type ResearchPlanTimelineRef = { id: TimelineId; name: string };

export type ResearchPlanGroup =
  | {
      block_id: string;
      anchor: "metric";
      metric: ResearchPlanMetricRef;
      dimensions: ResearchPlanDimensionRef[];
    }
  | {
      block_id: string;
      anchor: "dimension";
      dimension: ResearchPlanDimensionRef;
      metrics: ResearchPlanMetricRef[];
    };

export type ResearchPlanContext = {
  name: string;
  groups: ResearchPlanGroup[];
  timelines: ResearchPlanTimelineRef[];
};

// Result of the `remove_from_research_plan` tool: the validated ids the front-end removes from the
// draft plan. The tool is pure-echo (no DB), so this just mirrors what the agent asked to remove.
// `block_ids` drop whole groups; `members` deselect metrics/dimensions within a group (emptying a
// group drops it).
export type RemoveFromResearchPlanMember = {
  block_id: string;
  metric_ids?: number[];
  dimension_ids?: DimensionId[];
};

export type RemoveFromResearchPlanResponse = {
  block_ids?: string[];
  members?: RemoveFromResearchPlanMember[];
  timeline_ids?: number[];
};

export type ExplorationId = number;
export type ExplorationThreadId = number;
export type ExplorationQueryId = number;

export interface ExplorationMetricSelection {
  card_id: CardId;
  dimension_mappings?: DimensionMapping[] | null;
}

export interface ExplorationDimensionSelection {
  dimension_id: string;
  display_name?: string | null;
  effective_type?: string | null;
  semantic_type?: string | null;
}

export interface CreateExplorationRequest {
  name: string;
  description?: string | null;
  prompt?: string | null;
  collection_id?: CollectionId | null;
  timeline_ids?: TimelineId[];
  blocks: {
    type: "metric" | "dimension";
    metrics: ExplorationMetricSelection[];
    dimensions: ExplorationDimensionSelection[];
  }[];
}

export interface UpdateExplorationRequest {
  id: ExplorationId;
  name?: string | null;
  description?: string | null;
  archived?: boolean;
  collection_id?: CollectionId | null;
  collection_position?: number | null;
}

export interface CancelExplorationThreadRequest {
  explorationId: ExplorationId;
  threadId: ExplorationThreadId;
}

export interface CancelExplorationThreadResponse {
  id: ExplorationThreadId;
  canceled_at: string | null;
  completed_at: string | null;
}

export interface ExplorationThreadMetric {
  id: number;
  exploration_thread_id: ExplorationThreadId;
  card_id: CardId;
  dimension_mappings: DimensionMapping[] | null;
  position: number;
  card?: {
    name: string;
  };
}

export interface ExplorationThreadDimension {
  id: number;
  exploration_thread_id: ExplorationThreadId;
  dimension_id: string;
  display_name: string | null;
  effective_type: string | null;
  semantic_type: string | null;
  position: number;
}

export interface ExplorationThreadTimeline {
  id: number;
  exploration_thread_id: ExplorationThreadId;
  timeline_id: TimelineId;
  position: number;
  timeline?: Timeline & { events?: TimelineEvent[] };
}

export interface ExplorationQueryTimelineInterestingness {
  timeline_id: TimelineId;
  interestingness_score: number | null;
}

export type ExplorationQueryStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "canceled";

export const SETTLED_EXPLORATION_QUERY_STATUSES: ReadonlySet<ExplorationQueryStatus> =
  new Set(["done", "error", "canceled"]);

export function isSettledExplorationQueryStatus(
  status: ExplorationQueryStatus,
): boolean {
  return SETTLED_EXPLORATION_QUERY_STATUSES.has(status);
}

export type ExplorationQueryType =
  | "default"
  | "top-n-other"
  | "temporal-pattern-day"
  | "temporal-pattern-hour"
  | "time-facet"
  | "filtered-subset"
  | "per-value-time-series";

/**
 * Per-query plan params. Variant-specific — the BE attaches these to each
 * exploration query row (see `metabase.explorations.query-plan.variants`):
 *
 * - `top-n-other` carries `k` (Top-K size) and per-bar `value_index`.
 * - `per-value-time-series` carries `k` and `value_index`.
 * - `filtered-subset` carries `filter_values`.
 */
export interface ExplorationQueryParams {
  k?: number;
  value_index?: number;
  filter_values?: unknown[];
}

export interface ExplorationQuery {
  id: ExplorationQueryId;
  exploration_thread_id: ExplorationThreadId;
  card_id: CardId;
  dimension_id: string;
  dimension_name: string;
  query_type: ExplorationQueryType;
  display: string | null;
  name: string | null;
  position: number;
  status: ExplorationQueryStatus;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  entity_id: string;
  interestingness_score: number | null;
  contextual_interestingness_score?: number | null;
  timeline_interestingness?: ExplorationQueryTimelineInterestingness[];
  dataset_query: DatasetQuery;
  segment_id: SegmentId | null;
  segment_name: string | null;
  params?: ExplorationQueryParams | null;
}

/**
 * The id used by selection, routing, and comment anchoring for a navigable
 * page. Block and page `id`s arrive from the backend as numbers, but the
 * frontend keys selection/URL/comment-draft state by an opaque string
 * (`String(page.id)`), which is also what comments target.
 */
export type ExplorationPageNodeId = string;

export interface ExplorationPageNode {
  id: number;
  name: string | null;
  long_name: string | null;
  position: number;
  query_ids: ExplorationQueryId[];
  starred: boolean;
  hidden?: boolean;
}

export interface ExplorationBlockNode {
  id: number;
  type: "metric" | "dimension";
  name: string | null;
  position: number;
  pages: ExplorationPageNode[];
}

export function getExplorationQueryGroupStatus(
  queries: ExplorationQuery[],
): ExplorationQueryStatus {
  if (
    queries.length === 0 ||
    queries.some((q) => !isSettledExplorationQueryStatus(q.status))
  ) {
    return "running";
  }
  if (queries.some((q) => q.status === "error")) {
    return "error";
  }
  if (queries.some((q) => q.status === "canceled")) {
    return "canceled";
  }
  return "done";
}

export function getExplorationQueryGroupInterestingness(
  queries: ExplorationQuery[],
): number | null {
  let max: number | null = null;
  for (const q of queries) {
    const score =
      q.contextual_interestingness_score ?? q.interestingness_score ?? null;
    if (score != null && (max == null || score > max)) {
      max = score;
    }
  }
  return max;
}

export interface ExplorationThread {
  id: ExplorationThreadId;
  exploration_id: ExplorationId;
  name: string | null;
  prompt: string | null;
  position: number;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  entity_id: string;
  created_at: string;
  updated_at: string;
  metrics?: ExplorationThreadMetric[];
  dimensions?: ExplorationThreadDimension[];
  timelines?: ExplorationThreadTimeline[];
  queries?: ExplorationQuery[];
  blocks?: ExplorationBlockNode[] | null;
}

export interface ExplorationCreator {
  id: UserId;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface ExplorationSummary {
  id: ExplorationId;
  name: string;
  description?: string | null;
  creator_id: UserId;
  creator?: ExplorationCreator;
  collection_id?: CollectionId | null;
  collection?: Pick<Collection, "id" | "name"> | null;
  archived?: boolean;
  created_at: string;
  updated_at: string;
  current_user_last_touched_at: string;
}

export type GetMyExplorationsRequest = PaginationRequest;

export type GetMyExplorationsResponse = {
  data: ExplorationSummary[];
} & PaginationResponse;

export interface Exploration {
  id: ExplorationId;
  name: string;
  description: string | null;
  creator_id: UserId;
  archived: boolean;
  collection_id: CollectionId | null;
  collection_position: number | null;
  collection?: Collection | null;
  entity_id: string;
  created_at: string;
  updated_at: string;
  creator?: ExplorationCreator;
  threads?: ExplorationThread[];
  can_write: boolean;
}

export function getExplorationPages(
  exploration: Exploration,
): ExplorationPageNode[] {
  return (exploration.threads ?? []).flatMap((thread) =>
    (thread.blocks ?? []).flatMap((block) => block.pages ?? []),
  );
}
