import type {
  Card,
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import type Question from "metabase-lib/Question";
import type Dimension from "metabase-lib/Dimension";

type OnChangeCardAndRunOpts = {
  previousCard?: Card;
  nextCard: Card;
};

export type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;

export type ClickActionProps = {
  question: Question;
  clicked?: ClickObject;
  settings?: VisualizationSettings;
  extraData?: Record<string, any>;
};

export type DrillProps = Pick<ClickActionProps, "question" | "clicked">;

type ClickActionCreator = (props: ClickActionProps) => ClickAction[];

export interface QueryMode {
  name: string;
  drills: ClickActionCreator[];
  fallback?: ClickActionCreator;
}

export interface ClickObjectDimension {
  value: RowValue;
  column: DatasetColumn | null;
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

export interface ClickAction {
  name: string;
  title?: any; // React Element
  section?: string;
  icon?: string;
  buttonType?: string;
  default?: boolean;
}
