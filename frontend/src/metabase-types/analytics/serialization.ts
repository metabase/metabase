type SerializationEventSchema = {
  event: string;
  source: string;
  success: boolean;
  direction?: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
  count?: number | null;
  error_count?: number | null;
  models?: string | null;
  collection?: string | null;
  all_collections?: boolean | null;
  settings?: boolean | null;
  field_values?: boolean | null;
  secrets?: boolean | null;
};

type ValidateEvent<
  T extends SerializationEventSchema &
    Record<Exclude<keyof T, keyof SerializationEventSchema>, never>,
> = T;

export type SerializationEvent = ValidateEvent<{
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
}>;
