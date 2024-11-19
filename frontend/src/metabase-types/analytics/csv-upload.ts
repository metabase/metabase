type CsvUploadEventSchema = {
  event: string;
  model_id?: number | null;
  upload_seconds?: number | null;
  size_mb: number | null;
  num_columns: number | null;
  num_rows: number | null;
  generated_columns: number | null;
};

type ValidateEvent<
  T extends CsvUploadEventSchema &
    Record<Exclude<keyof T, keyof CsvUploadEventSchema>, never>,
> = T;

export type CsvUploadSuccessfulEvent = ValidateEvent<{
  event: "csv_upload_successful";
  model_id: number;
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
  upload_seconds: number;
}>;

export type CsvUploadFailedEvent = ValidateEvent<{
  event: "csv_upload_failed";
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
}>;

export type CsvAppendSuccessfulEvent = ValidateEvent<{
  event: "csv_append_successful";
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
  upload_seconds: number;
}>;

export type CsvAppendFailedEvent = ValidateEvent<{
  event: "csv_append_failed";
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
}>;

export type CsvUploadEvent =
  | CsvUploadSuccessfulEvent
  | CsvUploadFailedEvent
  | CsvAppendSuccessfulEvent
  | CsvAppendFailedEvent;
