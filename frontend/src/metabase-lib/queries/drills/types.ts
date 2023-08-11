import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import type Question from "metabase-lib/Question";
import type Dimension from "metabase-lib/Dimension";

export type ClickActionProps = {
  question: Question;
  clicked?: ClickObject;
  settings?: VisualizationSettings;
  extraData?: Record<string, any>;
};

export type DrillProps = Pick<ClickActionProps, "question" | "clicked">;

export interface ClickObjectDimension {
  value: RowValue;
  column: DatasetColumn;
}

export interface ClickObject {
  value?: RowValue;
  column?: DatasetColumn;
  dimensions?: ClickObjectDimension[];
  dimension?: Dimension; // used in table visualization for QuickFilterDrill
  event?: MouseEvent;
  element?: HTMLElement;
  seriesIndex?: number;
  settings?: Record<string, unknown>;
  origin?: {
    row: RowValue;
    cols: DatasetColumn[];
  };
  extraData?: Record<string, unknown>;
  data?: {
    col: DatasetColumn;
    value: RowValue;
  }[];
}
