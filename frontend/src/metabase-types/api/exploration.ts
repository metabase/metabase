import type { CardId } from "./card";
import type { Collection, CollectionId } from "./collection";
import type { DocumentId } from "./document";
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
  groups: {
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

export interface ExplorationDocument {
  id: DocumentId;
  exploration_thread_id: ExplorationThreadId;
  name: string;
  creator_id: UserId;
  content_type: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export type ExplorationQueryGroupId = string;

export type ExplorationQueryGroupDisplayType = "singleton" | "sidebar" | "page";

export interface ExplorationQueryGroup {
  id: ExplorationQueryGroupId;
  parent_group_id: ExplorationQueryGroupId | null;
  position: number;
  type: "auto";
  display_type: ExplorationQueryGroupDisplayType;
  name: string | null;
  group_name?: string | null;
  query_ids: ExplorationQueryId[];
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
  documents?: ExplorationDocument[];
  ai_summary_document_id?: DocumentId | null;
  groups?: ExplorationQueryGroup[] | null;
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
