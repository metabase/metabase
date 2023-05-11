import {
  Card,
  DatasetColumn,
  RowValue,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import Question from "metabase-lib/Question";

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

type ClickActionCreator = (props: ClickActionProps) => ClickAction[];

export interface QueryMode {
  name: string;
  drills: ClickActionCreator[];
  fallback?: ClickActionCreator;
}

export interface ClickObjectDimension {
  value: RowValue;
  column: DatasetColumn;
}

export interface ClickObject {
  value?: RowValue;
  column?: DatasetColumn;
  dimensions?: ClickObjectDimension[];
  event?: MouseEvent;
  element?: HTMLElement;
  seriesIndex?: number;
  settings?: Record<string, unknown>;
  origin?: {
    row: RowValue;
    cols: DatasetColumn[];
  };
  extraData?: Record<string, unknown>;
}

export type ClickActionPopoverProps = {
  series: Series;
  onChangeCardAndRun: OnChangeCardAndRun;
  onChange: (settings: VisualizationSettings) => void;
  onResize: (...args: unknown[]) => void;
  onClose: () => void;
};

export interface ClickAction {
  name: string;
  title?: any; // React Element
  section?: string;
  icon?: string;
  buttonType?: string;
  default?: boolean;
}
