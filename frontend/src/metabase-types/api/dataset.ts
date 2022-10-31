import type {
  DatetimeUnit,
  DimensionReference,
} from "metabase-types/api/query";
import { DatabaseId } from "./database";
import { DownloadPermission } from "./permissions";

export type RowValue = string | number | null | boolean;
export type RowValues = RowValue[];

export interface DatasetColumn {
  id?: number;
  display_name: string;
  source: string;
  name: string;
  remapped_to_column?: DatasetColumn;
  unit?: DatetimeUnit;
  field_ref?: DimensionReference;
  expression_name?: any;
  base_type?: string;
  semantic_type?: string;
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
