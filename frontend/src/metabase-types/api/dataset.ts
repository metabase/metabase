import type {
  DatetimeUnit,
  DimensionReference,
} from "metabase-types/api/query";
import { Card } from "./card";
import { DatabaseId } from "./database";
import { DownloadPermission } from "./permissions";

export type RowValue = string | number | null | boolean;
export type RowValues = RowValue[];

export interface DatasetColumn {
  id?: number;
  display_name: string;
  source: string;
  name: string;
  // FIXME: this prop does not come from API
  remapped_to_column?: DatasetColumn;
  unit?: DatetimeUnit;
  field_ref?: DimensionReference;
  expression_name?: any;
  base_type?: string;
  semantic_type?: string;
  remapped_from?: string;
  remapped_to?: string;
  binning_info?: {
    bin_width?: number;
  };
}

export interface DatasetData {
  rows: RowValues[];
  cols: DatasetColumn[];
  rows_truncated: number;
  download_perms?: DownloadPermission;
}

export interface Dataset {
  data: DatasetData;
  database_id: DatabaseId;
  row_count: number;
  running_time: number;
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
