import type { DateTimeUnit } from "./date-time";
import type { FormatValueOptions } from "./format";

export type RowValue = string | number | null | boolean | object;

export type Row = RowValue[];

export type DatasetData = {
  rows: Row[];

  cols: Column[];

  /**
   * How many results have been truncated. Present only when truncation occurred.
   */
  rows_truncated?: number;
};

export type DatasetError =
  | string
  | {
      status: number; // HTTP status code
      data?: string;
    };

export type SingleSeries = {
  data: DatasetData;
  error?: DatasetError;
};

export type Series = SingleSeries[];

export type BinningInfo = {
  binning_strategy?: "default" | "bin-width" | "num-bins";
  bin_width?: number;
  num_bins?: number;
  max_value?: number;
  min_value?: number;
};

export type ColumnId = number;

export type Column = {
  /**
   * Metabase identifier.
   */
  id?: ColumnId;

  /**
   * Source of the column (e.g. "fields", "aggregation", "breakout").
   */
  source: string;

  /**
   * Name of the column in the database.
   */
  name: string;

  /**
   * Name of the column shown in the UI.
   */
  display_name: string;

  /**
   * Description of the column set in Metabase.
   */
  description?: string | null;

  /**
   * Base type of the column in Metabase type system.
   */
  base_type?: string;

  /**
   * Semantic type of the column in Metabase type system.
   */
  semantic_type?: string | null;

  /**
   * Effective type of the column in Metabase type system.
   */
  effective_type?: string;

  /**
   * If the column value has been remapped, this is a name of the column it's been remapped from.
   */
  remapped_from?: string;

  /**
   * If the column value has been remapped, this is a name of the column it's been remapped to.
   */
  remapped_to?: string;

  /**
   * Present if column represents date and/or time.
   */
  unit?: DateTimeUnit;

  /**
   * Present if column is binned.
   */
  binning_info?: BinningInfo | null;

  /**
   * Column's visualization settings set in Metabase.
   */
  settings?: ColumnVisualizationSettings;
};

export type ColumnVisualizationSettings = FormatValueOptions;
