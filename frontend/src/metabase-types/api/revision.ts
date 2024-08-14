export interface Revision {
  id: number;
  description: string;
  message: string | null;
  timestamp: string;
  is_creation: boolean;
  is_reversion: boolean;
  has_multiple_changes: boolean;
  diff: { before: Record<string, any>; after: Record<string, any> } | null;
  user: {
    id: number;
    first_name: string;
    last_name: string;
    common_name: string;
  };
}

export interface RevisionListQuery {
  model_type: string;
  model_id: number | string;
}

export interface ListRevisionRequest {
  entity: "card" | "dashboard";
  id: number | string;
}

export interface RevertRevisionRequest {
  entity: "card" | "dashboard";
  id: number | string;
  revision_id: number;
}
