import type {
  Metabase_Lib_Schema_TemplateTag_Type,
  Metabase_Lib_Schema_TemporalBucketing_Unit,
} from "cljs/metabase.lib.js";
import type {
  CacheStrategy,
  LocalFieldReference,
  Parameter,
  ParameterValueOrArray,
  VisualizerColumnValueSource,
} from "metabase-types/api";

import type { Card } from "./card";
import type { DatabaseId } from "./database";
import type {
  Field,
  FieldFingerprint,
  FieldId,
  FieldVisibilityType,
} from "./field";
import type { Insight } from "./insight";
import type { ParameterOptions } from "./parameters";
import type { DownloadPermission } from "./permissions";
import type { DatasetQuery, DatetimeUnit, DimensionReference } from "./query";
import type { TableId } from "./table";

export type RowValue = string | number | null | boolean | object;
export type RowValues = RowValue[];

export type BinningMetadata = {
  binning_strategy?: "default" | "bin-width" | "num-bins";
  bin_width?: number;
  num_bins?: number;
  max_value?: number;
  min_value?: number;
};

export type AggregationType =
  | "count"
  | "sum"
  | "cum-sum"
  | "cum-count"
  | "distinct"
  | "min"
  | "max"
  | "avg"
  | "median"
  | "stddev";

export interface DatasetColumn {
  id?: FieldId;
  name: string;
  display_name: string;
  description?: string | null;
  source: string;
  database_type?: string;
  active?: boolean;
  entity_id?: string;
  fk_field_id?: number;
  nfc_path?: string[] | null;
  parent_id?: number | null;
  position?: number;

  aggregation_type?: AggregationType;

  coercion_strategy?: string | null;
  visibility_type?: FieldVisibilityType;
  table_id?: TableId;
  // FIXME: this prop does not come from API
  remapped_to_column?: DatasetColumn;
  unit?: DatetimeUnit;
  field_ref?: DimensionReference;
  // Deprecated. Columns from old saved questions might have expression_name, but new columns do not.
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
  columns: Field[];
}

export interface DatasetData {
  rows: RowValues[];
  cols: DatasetColumn[];
  insights?: Insight[] | null;
  results_metadata: ResultsMetadata;
  rows_truncated: number;
  requested_timezone?: string;
  results_timezone?: string;
  download_perms?: DownloadPermission;
  native_form: {
    query: string;
  };
  is_sandboxed?: boolean;
  "pivot-export-options"?: {
    "show-row-totals"?: boolean;
    "show-column-totals"?: boolean;
  };
}

export type JsonQuery = DatasetQuery & {
  parameters?: Parameter[];
  "cache-strategy"?: CacheStrategy & {
    /** An ISO 8601 date */
    "invalidated-at"?: string;
    /** In milliseconds */
    "avg-execution-ms"?: number;
  };
};

export interface Dataset {
  data: DatasetData;
  database_id: DatabaseId;
  row_count: number;
  running_time: number;
  json_query?: JsonQuery;
  error?: DatasetError;
  error_type?: DatasetErrorType;
  error_is_curated?: boolean;
  context?: string;
  status?: string;
  /** In milliseconds */
  average_execution_time?: number;
  /** A date in ISO 8601 format */
  cached?: string;
  /** A date in ISO 8601 format */
  started_at?: string;
}

export type DatasetError =
  | string
  | {
      status: number; // HTTP status code
      data?: string;
    };

export type DatasetErrorType =
  | "invalid-query"
  | "missing-required-parameter"
  | "missing-required-permissions"
  | string;

export interface EmbedDatasetData {
  rows: RowValues[];
  cols: DatasetColumn[];
  rows_truncated: number;
  insights?: Insight[];
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
  error_type: DatasetErrorType;
  error: string;
  status: string;
}

export interface NativeDatasetResponse {
  query: string;
  // some engines, e.g. mongo, require a "collection", which is the name of the source table
  collection?: string;
  // not used, added to the type only for completeness
  params: unknown;
}

export type SingleSeries = {
  card: Card;
  /**
   * A record that maps visualizer series keys (in the form of COLUMN_1,
   * COLUMN_2, etc.) to their original values (count, avg, etc.).
   */
  columnValuesMapping?: Record<string, VisualizerColumnValueSource[]>;
} & Pick<Dataset, "error" | "started_at" | "data" | "json_query">;

export type SingleSeriesWithTranslation = SingleSeries & {
  data: Dataset["data"] & {
    /**
     * The original, untranslated rows for this series (if any).
     * Undefined if no translation occurred.
     */
    untranslatedRows?: RowValues[];
  };
};

export type RawSeries = SingleSeries[];
export type TransformedSeries = RawSeries & { _raw: Series };
export type MaybeTranslatedSeries = SingleSeriesWithTranslation[];
export type Series = RawSeries | TransformedSeries;

export type TemplateTagId = string;
export type TemplateTagName = string;
// Using the generated type from CLJS schema
export type TemplateTagType = Metabase_Lib_Schema_TemplateTag_Type;

export interface TemplateTag {
  id: TemplateTagId;
  name: TemplateTagName;
  "display-name": string;
  type: TemplateTagType;
  required?: boolean;
  default?: string | null;

  // Card template specific
  "card-id"?: number;

  // Snippet specific
  "snippet-id"?: number;
  "snippet-name"?: string;

  // Field filter and time grouping specific
  dimension?: LocalFieldReference;
  alias?: string;

  // Field filter specific
  "widget-type"?: string;
  options?: ParameterOptions;
}

export type TemplateTags = Record<TemplateTagName, TemplateTag>;

// Using the generated type from CLJS schema which includes all temporal units
export type TemporalUnit = Metabase_Lib_Schema_TemporalBucketing_Unit;

export type GetRemappedParameterValueRequest = {
  parameter: Parameter;
  field_ids: FieldId[];
  value: ParameterValueOrArray;
};
