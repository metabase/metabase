import type { CardId } from "./card";
import type { DocumentId } from "./document";
import type { DimensionId, DimensionMapping, MetricDimension } from "./measure";
import type { Metric } from "./metric";
import type { DatasetQuery } from "./query";
import type { SegmentId } from "./segment";
import type { TimelineId } from "./timeline";
import type { UserId } from "./user";

export type GetExplorationDataRequest = {
  q?: string;
};

export type ExplorationDimensionGroup = {
  name: string;
  dimension_interestingness: number | null;
  dimensions: MetricDimension[];
};

type MetricWithDimensionIds = Metric & {
  dimension_ids: DimensionId[];
};

export type GetExplorationDataResponse = {
  metrics: MetricWithDimensionIds[];
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
  metrics: ExplorationMetricSelection[];
  dimensions: ExplorationDimensionSelection[];
  timeline_ids?: TimelineId[];
}

export interface ExplorationThreadMetric {
  id: number;
  exploration_thread_id: ExplorationThreadId;
  card_id: CardId;
  dimension_mappings: DimensionMapping[] | null;
  position: number;
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
}

export type ExplorationQueryStatus = "pending" | "running" | "done" | "error";

export const SETTLED_EXPLORATION_QUERY_STATUSES: ReadonlySet<ExplorationQueryStatus> =
  new Set(["done", "error"]);

export function isSettledExplorationQueryStatus(
  status: ExplorationQueryStatus,
): boolean {
  return SETTLED_EXPLORATION_QUERY_STATUSES.has(status);
}

export interface ExplorationQuery {
  id: ExplorationQueryId;
  exploration_thread_id: ExplorationThreadId;
  card_id: CardId;
  dimension_id: string;
  name: string | null;
  position: number;
  status: ExplorationQueryStatus;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  entity_id: string;
  interestingness_score: number | null;
  dataset_query: DatasetQuery;
  segment_id: SegmentId | null;
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

export interface ExplorationQueryGroup {
  id: ExplorationQueryGroupId;
  parent_group_id: ExplorationQueryGroupId | null;
  position: number;
  type: "auto";
  name: string | null;
  query_ids: ExplorationQueryId[];
}

/**
 * Combined status for a group of queries:
 * - `running` while any query is still pending or running
 * - `error` once every query has settled and at least one errored
 * - `done` once every query has settled and none errored
 */
export type ExplorationQueryGroupStatus = "running" | "error" | "done";

export function getExplorationQueryGroupStatus(
  queries: ExplorationQuery[],
): ExplorationQueryGroupStatus {
  if (
    queries.length === 0 ||
    queries.some((q) => !isSettledExplorationQueryStatus(q.status))
  ) {
    return "running";
  }
  if (queries.some((q) => q.status === "error")) {
    return "error";
  }
  return "done";
}

/**
 * Highest `interestingness_score` across the queries in a group, with `null`
 * scores ignored. Returns `null` when no query has a score yet.
 */
export function getExplorationQueryGroupInterestingness(
  queries: ExplorationQuery[],
): number | null {
  let max: number | null = null;
  for (const q of queries) {
    const score = q.interestingness_score;
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
  entity_id: string;
  created_at: string;
  updated_at: string;
  metrics?: ExplorationThreadMetric[];
  dimensions?: ExplorationThreadDimension[];
  timelines?: ExplorationThreadTimeline[];
  queries?: ExplorationQuery[];
  documents?: ExplorationDocument[];
  groups?: ExplorationQueryGroup[] | null;
}

export interface ExplorationCreator {
  id: UserId;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface Exploration {
  id: ExplorationId;
  name: string;
  description: string | null;
  creator_id: UserId;
  archived: boolean;
  entity_id: string;
  created_at: string;
  updated_at: string;
  creator?: ExplorationCreator;
  threads?: ExplorationThread[];
}

export type ExplorationQueryWithName = Omit<ExplorationQuery, "name"> & {
  name: string; // we only render queries with names
};

export type ThreadsWithSortedQueries = Omit<ExplorationThread, "queries"> & {
  queries: ExplorationQueryWithName[];
};
