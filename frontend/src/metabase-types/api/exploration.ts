import type { CardId } from "./card";
import type { DimensionMapping } from "./measure";
import type { DatasetQuery } from "./query";
import type { TimelineId } from "./timeline";
import type { UserId } from "./user";

export type ExplorationId = number;
export type ExplorationThreadId = number;
export type ExplorationQueryId = number;

export interface ExplorationMetricSelection {
  card_id: CardId;
  dimension_mappings?: DimensionMapping[];
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

export interface ExplorationQuery {
  id: ExplorationQueryId;
  exploration_thread_id: ExplorationThreadId;
  name: string | null;
  card_id: CardId;
  dimension_id: string;
  display: string | null;
  visualization_settings: Record<string, unknown> | null;
  dataset_query: DatasetQuery;
  position: number;
  entity_id: string;
  created_at: string;
  updated_at: string;
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
