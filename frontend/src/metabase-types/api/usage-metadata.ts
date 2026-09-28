import type { Card, CardId, CardType } from "./card";
import type { CollectionId } from "./collection";
import type { DatabaseId } from "./database";
import type { Measure } from "./measure";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { DatasetQuery } from "./query";
import type { Segment } from "./segment";
import type { TableId } from "./table";

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
  table_count: number;
};

export type UsageMetadataSnapshot = {
  id: number;
  finished_at: string;
  /** How many days of Card views the snapshot's view counts cover. */
  usage_window_days: number | null;
  summary: UsageMetadataSnapshotSummary | null;
};

export type UsageMetadataDatabase = {
  id: DatabaseId;
  name: string;
};

export type UsageMetadataTable = {
  id: TableId;
  schema: string | null;
  display_name: string;
  is_published: boolean;
  database: UsageMetadataDatabase;
};

export type UsageMetadataTableSummary = {
  table: UsageMetadataTable;
  candidate_count: number;
  /** Views of the distinct source Cards behind the Table's matching candidates. */
  recent_view_count: number;
};

export type UsageMetadataEvidence = {
  verified_source_count: number;
  official_source_count: number;
  popular_source_count: number;
  distinct_source_count: number;
  recent_view_count: number;
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
  last_used_at: string | null;
  table: UsageMetadataTable;
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
  card_id: CardId;
  card_name: string | null;
  card_type: CardType;
  verified: boolean;
  official: boolean;
  popular: boolean;
  recent_view_count: number;
  joined: boolean;
  stage_numbers: number[];
  model_lineage: UsageMetadataModelLineageItem[] | null;
  last_used_at: string | null;
  collection: UsageMetadataSourceCollection | null;
  dependency_paths?: UsageMetadataTableDependencyPath[];
};

export type UsageMetadataSourceCollection = {
  id: CollectionId;
  name: string;
  authority_level: "official" | null;
};

export type UsageMetadataCandidateMatch =
  | {
      relation: UsageMetadataMatchRelation;
      entity_type: "measure";
      entity: Pick<Measure, "id" | "name" | "description">;
    }
  | {
      relation: UsageMetadataMatchRelation;
      entity_type: "segment";
      entity: Pick<Segment, "id" | "name" | "description">;
    }
  | {
      relation: UsageMetadataMatchRelation;
      entity_type: "metric";
      entity: Pick<Card, "id" | "name" | "description">;
    };

export type UsageMetadataCandidateDetail = UsageMetadataCandidateSummary & {
  suggested_name: string;
  suggested_description: string | null;
  required_tables: UsageMetadataTable[];
  definition: UsageMetadataCandidateDefinition;
  creation_blockers: UsageMetadataCreationBlocker[];
  sources: UsageMetadataCandidateSource[];
  matches: UsageMetadataCandidateMatch[];
};

export type UsageMetadataPage<T> = PaginationResponse & {
  data: T[];
  snapshot: UsageMetadataSnapshot | null;
};

export type UsageMetadataReviewState = "to-review" | "discarded";

export type ListUsageMetadataRequest = PaginationRequest & {
  "table-id"?: TableId;
  "database-id"?: DatabaseId;
  schema?: string;
  "table-published"?: boolean;
  "candidate-type"?: UsageMetadataCandidateType | UsageMetadataCandidateType[];
  /** Defaults to `to-review`. Pass both to include discarded candidates alongside the rest. */
  review?: UsageMetadataReviewState[];
  "modeling-status"?: UsageMetadataModelingStatus[];
  /** @deprecated Shorthand for `review` and `modeling-status`, used only when neither is given. */
  queue?: UsageMetadataCleanupQueue;
  /** ISO-8601 date or date-time; inclusive. */
  "last-used-from"?: string;
  /** ISO-8601 date or date-time; exclusive. */
  "last-used-to"?: string;
  search?: string;
  "sort-direction"?: "asc" | "desc";
};

export type ListUsageMetadataCandidatesRequest = ListUsageMetadataRequest & {
  /** Omit for deterministic recommendation-family order. */
  "sort-column"?: "name" | "views" | "sources" | "last-used";
};

export type ListUsageMetadataTablesRequest = ListUsageMetadataRequest & {
  /** Omit for the Tables with the most candidates first. */
  "sort-column"?: "name" | "views" | "candidates";
};

export type CreateUsageMetadataCandidateRequest = {
  id: number;
  name?: string;
  description?: string | null;
};

export type CreateUsageMetadataCandidateResponse = {
  id: number;
};

export type UsageMetadataRunState = {
  id: number;
  status: "queued" | "running" | "failed";
};

export type UsageMetadataRefreshStatus = {
  snapshot: UsageMetadataSnapshot | null;
  active: UsageMetadataRunState | null;
  failure: UsageMetadataRunState | null;
};

export type StartUsageMetadataRefreshResponse = {
  run_id: number;
};
