import type { GroupId } from "./group";
import type { UserAttributeMap, UserId } from "./user";

export type PermissionPreviewId = number;

export type StartPermissionPreviewRequest =
  | { user_id: UserId }
  | { group_id: GroupId; attributes?: UserAttributeMap };

export type PermissionPreviewSession = {
  id: PermissionPreviewId;
  token: string;
  expires_at: string;
  user_id: UserId;
};

export type PermissionDebugAction =
  | "card/read"
  | "card/query"
  | "card/download-data"
  | "dashboard/read"
  | "dashboard/query"
  | "collection/read";

export type PermissionDebugRequest = {
  user_id: UserId;
  model_id: number;
  action_type: PermissionDebugAction;
};

export type PermissionDebugDecision = "allow" | "denied" | "limited";

export type PermissionDebugOutcome =
  | "allowed"
  | "reshaped"
  | "limited"
  | "denied"
  | "broken";

export type PermissionDebugGroupValue = {
  "group-id": GroupId;
  "group-name": string;
  value: string;
  "applies?": boolean;
};

export type PermissionDebugCollection = {
  "collection-id": number | null;
  name: string;
  "personal?": boolean;
  value: "curate" | "view" | "none";
  "by-rule": boolean;
  groups: PermissionDebugGroupValue[];
};

export type PermissionDebugAccessRequest = { "user-id": UserId };

/** Everything a person can reach: every collection, and every table as a query check lists them */
export type PermissionDebugAccess = {
  collections: (PermissionDebugCollection & { location: string })[];
  reasons: PermissionDebugReasons;
};

export type PermissionDebugTablePermission = {
  value: string;
  groups: PermissionDebugGroupValue[];
};

export type PermissionDebugSandboxFilter = {
  attribute: string;
  value: string | null;
  column: string;
  "missing?": boolean;
};

export type PermissionDebugSandbox = {
  "sandbox-id": number;
  "table-id": number;
  "group-id": GroupId;
  "group-name": string;
  "enforced?": boolean;
  "columns-limited?": boolean;
  filters: PermissionDebugSandboxFilter[];
};

export type PermissionDebugTable = {
  "table-id": number;
  "db-id": number;
  "db-name": string;
  schema: string | null;
  name: string;
  "view-data": PermissionDebugTablePermission;
  "create-queries": PermissionDebugTablePermission;
  "download-results": PermissionDebugTablePermission;
  sandboxes: PermissionDebugSandbox[];
};

export type PermissionDebugImpersonation = {
  "db-id": number;
  "db-name": string;
  "group-id": GroupId;
  "group-name": string;
  attribute: string;
  value: string | null;
  "missing?": boolean;
  "enforced?": boolean;
};

export type PermissionDebugRoute = {
  "db-id": number;
  "db-name": string;
  attribute: string;
  value: string | null;
  status: "routed" | "router" | "missing-value" | "no-destination";
  "destination-id": number | null;
  "destination-name": string | null;
};

export type PermissionDebugProblem =
  | { type: "missing-attribute"; attribute: string; "table-id"?: number }
  | { type: "missing-attribute"; attribute: string; "db-id": number }
  | {
      type: "conflicting-sandboxes";
      "table-id": number;
      "group-ids": GroupId[];
    }
  | { type: "sandbox-and-impersonation"; "db-id": number }
  | { type: "routing-missing-value"; attribute: string; "db-id": number }
  | { type: "routing-no-destination"; attribute: string; "db-id": number };

export type PermissionDebugReasons = {
  collection?: PermissionDebugCollection;
  tables?: PermissionDebugTable[];
  impersonations?: PermissionDebugImpersonation[];
  routes?: PermissionDebugRoute[];
  problems?: PermissionDebugProblem[];
};

export type PermissionDebugAnswer = {
  decision: PermissionDebugDecision;
  outcome: PermissionDebugOutcome;
  "model-type": "card" | "dashboard" | "collection" | "invalid";
  "model-id": string;
  segment: ("sandboxed" | "impersonated" | "routed")[];
  message: string[];
  data: {
    "blocked-tables"?: Record<string, string[]>;
    "download-limited-tables"?: Record<string, string[]>;
    "download-no-tables"?: Record<string, string[]>;
    "cards-total"?: number;
    "cards-blocked"?: number;
  };
  reasons: PermissionDebugReasons;
};
