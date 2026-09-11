// Mirrors the response schemas in
// enterprise/backend/src/metabase_enterprise/data_sensitivity/core.clj

import type { DatabaseId } from "./database";
import type { FieldId } from "./field";
import type { ConcreteTableId } from "./table";

export const DATA_SENSITIVITY_TYPES = [
  "SEC_KEY",
  "SYS_TELEMETRY",
  "PHI",
  "BIO_GEN",
  "PCI_FIN",
  "SENS_PERS",
  "PII",
  "CORP_IP",
  "BIZ_CONF",
  "PUBLIC",
] as const;
export type DataSensitivity = (typeof DATA_SENSITIVITY_TYPES)[number];

export const DATA_SENSITIVITY_FIELD_STATUSES = [
  "agree",
  "disagree",
  "new",
  "abstain",
  "dropped",
] as const;
export type DataSensitivityFieldStatus =
  (typeof DATA_SENSITIVITY_FIELD_STATUSES)[number];

export type DataSensitivityCurrentState = "human" | "classifier" | "unscanned";

export type DataSensitivityConfidence = "high" | "medium" | "low";

export type DataSensitivityUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
};

export type DataSensitivityCounts = {
  fields: number;
  agree: number;
  disagree: number;
  new: number;
  abstain: number;
  dropped: number;
  semantic_changed: number;
};

export type DataSensitivityFieldResult = {
  field_id: FieldId;
  name: string;
  display_name: string | null;
  base_type: string;
  current: {
    data_sensitivity: DataSensitivity | null;
    human_set: boolean;
    state: DataSensitivityCurrentState;
    semantic_type: string | null;
  };
  proposed: {
    data_sensitivity: DataSensitivity | null;
    confidence: DataSensitivityConfidence | null;
    semantic_type: string | null;
    reasoning: string | null;
  };
  status: DataSensitivityFieldStatus;
  semantic_changed: boolean;
};

export type DataSensitivityTableResult = {
  table_id: ConcreteTableId;
  table_name: string;
  schema: string | null;
  database_id: DatabaseId;
  model: string;
  requests: number;
  usage: DataSensitivityUsage;
  sample_error: string | null;
  counts: DataSensitivityCounts;
  fields: DataSensitivityFieldResult[];
};

export type DataSensitivityTableError = {
  table_id: ConcreteTableId;
  table_name: string;
  schema: string | null;
  error: string;
  error_code: string | null;
};

export type DataSensitivityDatabaseResult = {
  database_id: DatabaseId;
  schema: string | null;
  tables: (DataSensitivityTableResult | DataSensitivityTableError)[];
  counts: DataSensitivityCounts;
  usage: DataSensitivityUsage;
  requests: number;
  failed: number;
};

export type ClassifyDataSensitivityDatabaseRequest = {
  id: DatabaseId;
  schema?: string;
};

export type DataSensitivityUnavailableReason =
  | "metabot-disabled"
  | "no-llm"
  | "usage-limit"
  | "permission-denied";

export type DataSensitivityUnavailableError = {
  message: string;
  reason: DataSensitivityUnavailableReason;
};
