import type { LocalFieldReference } from "metabase-types/api";
import { Card } from "./card";
import { DatabaseId } from "./database";
import { FieldFingerprint, FieldId, FieldVisibilityType } from "./field";
import { DatasetQuery, DatetimeUnit, DimensionReference } from "./query";
import { DownloadPermission } from "./permissions";
import { TableId } from "./table";

export type RowValue = string | number | null | boolean;
export type RowValues = RowValue[];

export interface DatasetColumn {
  id?: FieldId;
  name: string;
  display_name: string;
  description: string | null;
  source?: string;
  coercion_strategy: string | null;
  visibility_type: FieldVisibilityType;
  table_id: TableId;
  // FIXME: this prop does not come from API
  remapped_to_column?: DatasetColumn;
  unit?: DatetimeUnit;
  field_ref?: DimensionReference;
  expression_name?: any;
  base_type?: string;
  semantic_type?: string;
  remapped_from?: string;
  remapped_to?: string;
  effective_type?: string;
  binning_info?: {
    bin_width?: number;
  };
  settings?: Record<string, any>;
  fingerprint: FieldFingerprint | null;
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
  error?: string;
  context?: string;
  status?: string;
}

export interface NativeQueryForm {
  query: string;
}

export type SingleSeries = {
  card: Card;
  data: DatasetData;
  error_type?: string;
  error?: {
    status: number; // HTTP status code
    data?: string;
  };
};

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
  default?: string;

  // Card template specific
  "card-id"?: number;

  // Snippet specific
  "snippet-id"?: number;
  "snippet-name"?: string;
}

export type TemplateTags = { [key: TemplateTagName]: TemplateTag };
