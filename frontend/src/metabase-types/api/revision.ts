export type RevisionId = number;

export type FieldDiff = { before?: unknown; after?: unknown };

export type SegmentRevisionDiff = {
  name?: FieldDiff;
  description?: FieldDiff;
  definition?: FieldDiff;
};

export type CardOrDashboardRevisionDiff = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type RevisionDiff = SegmentRevisionDiff | CardOrDashboardRevisionDiff;

export interface Revision {
  id: RevisionId;
  description: string;
  message: string | null;
  timestamp: string;
  is_creation: boolean;
  is_reversion: boolean;
  has_multiple_changes: boolean;
  diff: RevisionDiff | null;
  user: {
    id: number;
    first_name: string;
    last_name: string;
    common_name: string;
  };
}

export type RevisionEntityType =
  | "card"
  | "dashboard"
  | "segment"
  | "measure"
  | "document"
  | "transform";

export interface ListRevisionRequest {
  entity: RevisionEntityType;
  id: number | string;
}

export interface RevertRevisionRequest {
  entity: RevisionEntityType;
  id: number | string;
  revision_id: number;
}
