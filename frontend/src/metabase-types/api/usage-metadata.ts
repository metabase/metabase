import type { CardId, CardType } from "./card";
import type { DatabaseId } from "./database";
import type { Measure } from "./measure";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery } from "./query";
import type { Segment } from "./segment";
import type { TableDataLayer, TableId } from "./table";
import type { UserId } from "./user";

export type UsageMetadataCandidateType =
  | "table"
  | "metric"
  | "measure"
  | "segment";
export type UsageMetadataModelingStatus =
  | "missing"
  | "partially-modeled"
  | "modeled";
export type UsageMetadataCleanupQueue = "suggested" | "used-raw" | "discarded";
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
  candidate_count: number;
  measure_count: number;
  segment_count: number;
  metric_count: number;
  publish_table_count: number;
  table_count: number;
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
  is_published: boolean;
  collection_id: number | null;
  database: UsageMetadataDatabase;
};

export type UsageMetadataTableSummary = {
  table: UsageMetadataTable;
  candidate_count: number;
};

export type UsageMetadataEvidence = {
  verified_source_count: number;
  official_source_count: number;
  popular_source_count: number;
  distinct_source_count: number;
  total_view_count: number;
};

export type UsageMetadataPredicateKind =
  | "boolean"
  | "category"
  | "number"
  | "temporal"
  | "other";

export type UsageMetadataCandidatePresentation = {
  aggregation?: {
    display_name: string;
  };
  predicates: {
    signature: string;
    display_name: string;
    kind: UsageMetadataPredicateKind;
  }[];
};

export type UsageMetadataRequiredTable = {
  id: TableId;
  database_id: DatabaseId;
  database_name: string;
  schema: string | null;
  name: string;
  display_name: string;
  description: string | null;
  data_layer: TableDataLayer | null;
  data_authority: string | null;
  view_count: number;
  is_published: boolean;
};

export type UsageMetadataCandidateDefinition =
  | DatasetQuery
  | { table_id: TableId };

export type UsageMetadataCandidateSummary = {
  id: number;
  candidate_type: UsageMetadataCandidateType;
  display_name: string;
  presentation: UsageMetadataCandidatePresentation;
  modeling_status: UsageMetadataModelingStatus;
  dismissed: boolean;
  evidence: UsageMetadataEvidence;
};

export type UsageMetadataModelLineageItem = {
  id: CardId;
  name: string;
};

export type UsageMetadataTableDependencyPath = {
  direct: boolean;
  models: UsageMetadataModelLineageItem[];
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
  dependency_paths?: UsageMetadataTableDependencyPath[];
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
  table: UsageMetadataTable;
  suggested_name: string;
  suggested_description: string | null;
  required_tables: UsageMetadataRequiredTable[];
  definition: UsageMetadataCandidateDefinition;
  creation_blockers: UsageMetadataCreationBlocker[];
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
  "candidate-type"?: UsageMetadataCandidateType;
  queue?: UsageMetadataCleanupQueue;
  search?: string;
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
  entity: {
    id: number;
    name: string;
    table_id?: TableId;
    definition?: DatasetQuery;
    description?: string | null;
    archived?: boolean;
  };
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
