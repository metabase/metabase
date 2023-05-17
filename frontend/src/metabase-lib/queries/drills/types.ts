import {
  Card,
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import Question from "metabase-lib/Question";

type OnChangeCardAndRunOpts = {
  previousCard?: Card;
  nextCard: Card;
};

export type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;

type ClickActionProps = {
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
  settings?: Record<string, any>;
  origin?: {
    row: RowValue;
    cols: DatasetColumn[];
  };
  extraData?: Record<string, any>;
}

type ClickActionPopoverProps = {
  onChangeCardAndRun: OnChangeCardAndRun;
  onClose: () => void;
};

export interface ClickAction {
  title?: any; // React Element
  icon?: string;
  popover?: (props: ClickActionPopoverProps) => any; // React Element
  question?: () => Question | undefined;
  url?: () => string;
  action?: () => any; // redux action
  section?: string;
  name?: string;
  default?: boolean;
  defaultAlways?: boolean;
}
