export type CsvUploadSuccessfulEvent = {
  event: "csv_upload_successful";
  model_id: number;
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
  upload_seconds: number;
};

export type CsvUploadFailedEvent = {
  event: "csv_upload_failed";
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
};

export type CsvAppendSuccessfulEvent = {
  event: "csv_append_successful";
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
  upload_seconds: number;
};

export type CsvAppendFailedEvent = {
  event: "csv_append_failed";
  size_mb: number;
  num_columns: number;
  num_rows: number;
  generated_columns: number;
};

export type CsvUploadClickedEvent = {
  event: "csv_upload_clicked";
  source: "left_nav";
};

export type CsvUploadEvent =
  | CsvUploadSuccessfulEvent
  | CsvUploadFailedEvent
  | CsvAppendSuccessfulEvent
  | CsvAppendFailedEvent
  | CsvUploadClickedEvent;
