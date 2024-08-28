export type SerializationEvent = {
  event: "serialization";
  direction: "import" | "export";
  source: "cli" | "api";
  duration_ms: number;
  success: boolean;
  error_message: string | null;
  count: number;
  error_count: number;
  models: string;
  collection: string | null;
  all_collections: boolean;
  settings: boolean;
  field_values: boolean;
  secrets: boolean;
};
