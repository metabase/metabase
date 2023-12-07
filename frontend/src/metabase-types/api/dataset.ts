import type { LocalFieldReference } from "metabase-types/api";
import type { Card } from "./card";
import type { DatabaseId } from "./database";
import type { FieldFingerprint, FieldId, FieldVisibilityType } from "./field";
import type { DatasetQuery, DatetimeUnit, DimensionReference } from "./query";
import type { DownloadPermission } from "./permissions";
import type { ParameterOptions } from "./parameters";
import type { TableId } from "./table";

export type RowValue = string | number | null | boolean;
export type RowValues = RowValue[];

export type BinningMetadata = {
  binning_strategy?: "default" | "bin-width" | "num-bins";
  bin_width?: number;
  num_bins?: number;
};

export interface DatasetColumn {
  id?: FieldId;
  name: string;
  display_name: string;
  description?: string | null;
  source: string;
  coercion_strategy?: string | null;
  visibility_type?: FieldVisibilityType;
  table_id?: TableId;
  // FIXME: this prop does not come from API
  remapped_to_column?: DatasetColumn;
  unit?: DatetimeUnit;
  field_ref?: DimensionReference;
  expression_name?: any;
  base_type?: string;
  semantic_type?: string | null;
  remapped_from?: string;
  remapped_to?: string;
  effective_type?: string;
  binning_info?: BinningMetadata | null;
  settings?: Record<string, any>;
  fingerprint?: FieldFingerprint | null;

  // model with customized metadata
  fk_target_field_id?: FieldId | null;
}

export interface ResultsMetadata {
  columns: DatasetColumn[];
}

export interface DatasetData {
  rows: RowValues[];
  cols: DatasetColumn[];
  rows_truncated: number;
  requested_timezone?: string;
  results_timezone?: string;
  download_perms?: DownloadPermission;
  results_metadata: ResultsMetadata;
}

export type JsonQuery = DatasetQuery & {
  parameters?: unknown[];
};

export interface Dataset {
  data: DatasetData;
  database_id: DatabaseId;
  row_count: number;
  running_time: number;
  json_query?: JsonQuery;
  error_type?: string;
  error?: {
    status: number; // HTTP status code
    data?: string;
  };
  context?: string;
  status?: string;
}

export interface EmbedDatasetData {
  rows: RowValues[];
  cols: DatasetColumn[];
  rows_truncated: number;
  // TODO: Correct this type
  insights: any;
  requested_timezone?: string;
  results_timezone?: string;
}

export type EmbedDataset = SuccessEmbedDataset | ErrorEmbedDataset;

interface SuccessEmbedDataset {
  data: EmbedDatasetData;
  json_query: JsonQuery;
  status: string;
}

export interface ErrorEmbedDataset {
  error_type: string;
  error: string;
  status: string;
}

export interface NativeQueryForm {
  query: string;
}

export type SingleSeries = {
  card: Card;
} & Dataset;

export type RawSeries = SingleSeries[];
export type TransformedSeries = RawSeries & { _raw: Series };
export type Series = RawSeries | TransformedSeries;

export type TemplateTagId = string;
export type TemplateTagName = string;
export type TemplateTagType =
  | "card"
  | "text"
  | "number"
  | "date"
  | "dimension"
  | "snippet";

export interface TemplateTag {
  id: TemplateTagId;
  name: TemplateTagName;
  "display-name": string;
  type: TemplateTagType;
  dimension?: LocalFieldReference;
  "widget-type"?: string;
  required?: boolean;
  default?: string | null;
  options?: ParameterOptions;

  // Card template specific
  "card-id"?: number;

  // Snippet specific
  "snippet-id"?: number;
  "snippet-name"?: string;
}

export type TemplateTags = { [key: TemplateTagName]: TemplateTag };
