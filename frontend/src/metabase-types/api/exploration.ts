import type { CardId } from "./card";
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

export type ExplorationQueryGroupType = "auto";

export interface ExplorationQueryGroup {
  id: string;
  type: ExplorationQueryGroupType;
  name: string | null;
  query_ids: ExplorationQueryId[];
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
  groups?: ExplorationQueryGroup[];
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
