import { DatasetData, Column, Row, Value } from "metabase-types/types/Dataset";
import { Card } from "metabase-types/types/Card";
import { VisualizationSettings } from "metabase-types/api/card";
import { ReduxAction } from "metabase-types/types/redux";

// import Question from "metabase-lib/lib/Question";
type Question = any;

export type ActionCreator = (props: ClickActionProps) => ClickAction[];

export type QueryMode = {
  name: string;
  drills: () => ActionCreator[];
};

export type HoverData = Array<{ key: string; value: any; col?: Column }>;

export type HoverObject = {
  index?: number;
  axisIndex?: number;
  data?: HoverData;
  element?: HTMLElement;
  event?: MouseEvent;
};

export type DimensionValue = {
  value: Value;
  column: Column;
};

export type ClickObject = {
  value?: Value;
  column?: Column;
  dimensions?: DimensionValue[];
  event?: MouseEvent;
  element?: HTMLElement;
  seriesIndex?: number;
  settings?: Record<string, any>;
  origin?: {
    row: Row;
    cols: Column[];
  };
  extraData?: Record<string, any>;
};

export type ClickAction = {
  title?: any; // React Element
  icon?: string;
  popover?: (props: ClickActionPopoverProps) => any; // React Element
  question?: () => Question | undefined;
  url?: () => string;
  action?: () => ReduxAction | undefined;
  section?: string;
  name?: string;
  default?: boolean;
  defaultAlways?: boolean;
};

export type ClickActionProps = {
  question: Question;
  clicked?: ClickObject;
  settings?: VisualizationSettings;
  extraData?: Record<string, any>;
};

export type OnChangeCardAndRun = ({
  nextCard,
  previousCard,
}: {
  nextCard: Card;
  previousCard?: Card;
}) => void;

export type ClickActionPopoverProps = {
  onChangeCardAndRun: OnChangeCardAndRun;
  onClose: () => void;
};

export type SingleSeries = { card: Card; data: DatasetData };
export type RawSeries = SingleSeries[];
export type TransformedSeries = RawSeries & { _raw: Series };
export type Series = RawSeries | TransformedSeries;

// These are the props provided to the visualization implementations BY the Visualization component
export type VisualizationProps = {
  series: Series;
  card: Card;
  data: DatasetData;
  settings: VisualizationSettings;

  className?: string;
  gridSize?: {
    width: number;
    height: number;
  };

  width: number;
  height: number;

  showTitle: boolean;
  isDashboard: boolean;
  isEditing: boolean;
  isSettings: boolean;
  actionButtons: Node;

  onRender: ({
    yAxisSplit,
    warnings,
  }: {
    yAxisSplit?: number[][];
    warnings?: string[];
  }) => void;
  onRenderError: (error?: Error) => void;

  hovered?: HoverObject;
  onHoverChange: (hoverObject?: HoverObject) => void;
  onVisualizationClick: (clickObject?: ClickObject) => void;
  visualizationIsClickable: (clickObject?: ClickObject) => boolean;
  onChangeCardAndRun: OnChangeCardAndRun;

  onUpdateVisualizationSettings: (settings: Record<string, any>) => void;

  onAddSeries?: any;
  onEditSeries?: any;
  onRemoveSeries?: any;

  onUpdateWarnings?: any;
};
