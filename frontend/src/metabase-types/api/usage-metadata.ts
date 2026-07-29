import type { CardId, CardType } from "./card";
import type { DatabaseId } from "./database";
import type { Measure } from "./measure";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery } from "./query";
import type { Segment } from "./segment";
import type { TableDataLayer, TableId } from "./table";
import type { UserId } from "./user";

export type UsageMetadataCandidateType = "measure" | "segment";
export type UsageMetadataModelingStatus =
  | "missing"
  | "partially-modeled"
  | "modeled";
export type UsageMetadataSignal = "verified" | "official" | "popular";
export type UsageMetadataCleanupQueue = "suggested" | "discarded";
export type UsageMetadataCandidateSort =
  | "priority"
  | "name"
  | "source-count"
  | "view-count";
export type UsageMetadataSortDirection = "asc" | "desc";
export type UsageMetadataCreationBlocker =
  | "table-not-published"
  | "table-inactive"
  | "table-uneditable";
export type UsageMetadataMatchRelation =
  | "exact"
  | "same-base"
  | "subset"
  | "superset"
  | "overlap";

export type UsageMetadataSnapshotSummary = {
  "candidate-count": number;
  "measure-count": number;
  "segment-count": number;
  "table-count": number;
};

export type UsageMetadataSnapshot = {
  id: number;
  finished_at: string;
  algorithm_version: number;
  summary: UsageMetadataSnapshotSummary | null;
};

export type UsageMetadataDatabase = {
  id: DatabaseId;
  name: string;
};

export type UsageMetadataTable = {
  id: TableId;
  db_id: DatabaseId;
  schema: string | null;
  name: string;
  display_name: string;
  description: string | null;
  data_layer: TableDataLayer | null;
  data_authority: string | null;
  view_count: number;
  active?: boolean;
  visibility_type?: string | null;
  is_published: boolean;
  collection_id: number | null;
  database: UsageMetadataDatabase;
  publication_ready?: boolean;
  creation_blockers?: UsageMetadataCreationBlocker[];
};

export type UsageMetadataStatusCounts = Record<
  UsageMetadataModelingStatus,
  number
>;

export type UsageMetadataCandidateCounts = Record<
  UsageMetadataCandidateType,
  UsageMetadataStatusCounts
>;

export type UsageMetadataTableSummary = {
  table: UsageMetadataTable;
  counts: UsageMetadataCandidateCounts;
  candidate_count: number;
};

export type UsageMetadataTableDetail = UsageMetadataTableSummary & {
  dismissed_count: number;
  snapshot: UsageMetadataSnapshot | null;
};

export type UsageMetadataEvidence = {
  verified_source_count: number;
  official_source_count: number;
  popular_source_count: number;
  distinct_source_count: number;
  total_view_count: number;
};

export type UsageMetadataCandidateSummary = {
  id: number;
  candidate_type: UsageMetadataCandidateType;
  table: UsageMetadataTable;
  suggested_name: string;
  suggested_description: string | null;
  definition: DatasetQuery;
  modeling_status: UsageMetadataModelingStatus;
  dismissed: boolean;
  evidence: UsageMetadataEvidence;
  creation_blockers: UsageMetadataCreationBlocker[];
};

export type UsageMetadataModelLineageItem = {
  id: CardId;
  name: string;
};

export type UsageMetadataCandidateSource = {
  id: number;
  candidate_id: number;
  card_id: CardId;
  card_name: string | null;
  card_type: CardType;
  verified: boolean;
  official: boolean;
  popular: boolean;
  view_count: number;
  joined: boolean;
  stage_numbers: number[];
  model_lineage: UsageMetadataModelLineageItem[] | null;
};

export type UsageMetadataCandidateMatch =
  | {
      relation: UsageMetadataMatchRelation;
      entity_type: "measure";
      entity: Pick<Measure, "id" | "name" | "description" | "archived">;
    }
  | {
      relation: UsageMetadataMatchRelation;
      entity_type: "segment";
      entity: Pick<Segment, "id" | "name" | "description" | "archived">;
    };

export type UsageMetadataCandidateDismissal = {
  id: number;
  dismissed_by: UserId;
  dismissed_at: string;
  reason: string | null;
};

export type UsageMetadataCandidateDetail = UsageMetadataCandidateSummary & {
  semantic_details: Record<string, unknown>;
  dismissal: UsageMetadataCandidateDismissal | null;
  sources: UsageMetadataCandidateSource[];
  matches: UsageMetadataCandidateMatch[];
};

export type UsageMetadataPage<T> = PaginationResponse & {
  data: T[];
  snapshot: UsageMetadataSnapshot | null;
};

export type ListUsageMetadataRequest = PaginationRequest & {
  "table-id"?: TableId;
  "database-id"?: DatabaseId;
  schema?: string;
  "candidate-type"?: UsageMetadataCandidateType;
  "modeling-status"?: UsageMetadataModelingStatus;
  signal?: UsageMetadataSignal;
  queue?: UsageMetadataCleanupQueue;
  search?: string;
  sort?: UsageMetadataCandidateSort;
  direction?: UsageMetadataSortDirection;
};

export type DismissUsageMetadataCandidateRequest = {
  id: number;
  reason?: string | null;
};

export type CreateUsageMetadataCandidateRequest = {
  id: number;
  name?: string;
  description?: string | null;
};

export type CreateUsageMetadataCandidateResponse = {
  candidate: UsageMetadataCandidateDetail;
  entity: Measure | Segment;
};

export type UsageMetadataRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type UsageMetadataRun = {
  id: number;
  status: UsageMetadataRunStatus;
  trigger: "scheduled" | "manual";
  requested_by: UserId | null;
  algorithm_version: number;
  source_config: Record<string, unknown>;
  summary: UsageMetadataSnapshotSummary | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type UsageMetadataRefreshStatus = {
  snapshot: UsageMetadataRun | null;
  active: UsageMetadataRun | null;
  failure: UsageMetadataRun | null;
  fresh: boolean;
};

export type StartUsageMetadataRefreshResponse = {
  run_id: number;
};
