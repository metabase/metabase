import type {
  DatasetData,
  Column,
  Row,
  Value,
} from "metabase-types/types/Dataset";
import type { Card, VisualizationSettings } from "metabase-types/types/Card";
import type { ReduxAction } from "metabase-types/types/redux";
import Question from "metabase-lib/lib/Question";

export type ActionCreator = (props: ClickActionProps) => ClickAction[];

export type QueryMode = {
  name: string,
  drills: () => ActionCreator[],
};

export type HoverData = Array<{ key: string, value: any, col?: Column }>;

export type HoverObject = {
  index?: number,
  axisIndex?: number,
  data?: HoverData,
  element?: HTMLElement,
  event?: MouseEvent,
};

export type DimensionValue = {
  value: Value,
  column: Column,
};

export type ClickObject = {
  value?: Value,
  column?: Column,
  dimensions?: DimensionValue[],
  event?: MouseEvent,
  element?: HTMLElement,
  seriesIndex?: number,
  settings?: { [key: string]: any },
  origin?: {
    row: Row,
    cols: Column[],
  },
  extraData?: { [key: string]: any },
};

export type ClickAction = {
  title?: any, // React Element
  icon?: string,
  popover?: (props: ClickActionPopoverProps) => any, // React Element
  question?: () => Question | void,
  url?: () => string,
  action?: () => ReduxAction | void,
  section?: string,
  name?: string,
  default?: boolean,
  defaultAlways?: boolean,
};

export type ClickActionProps = {
  question: Question,
  clicked?: ClickObject,
};

export type OnChangeCardAndRun = (data: {
  nextCard: Card,
  previousCard?: Card,
}) => void;

export type ClickActionPopoverProps = {
  onChangeCardAndRun: OnChangeCardAndRun,
  onClose: () => void,
};

export type SingleSeries = { card: Card, data: DatasetData };
export type RawSeries = SingleSeries[];
export type TransformedSeries = RawSeries & { _raw: Series };
export type Series = RawSeries | TransformedSeries;

// These are the props provided to the visualization implementations BY the Visualization component
export type VisualizationProps = {
  series: Series,
  card: Card,
  data: DatasetData,
  settings: VisualizationSettings,

  className?: string,
  gridSize?: {
    width: number,
    height: number,
  } | null,

  width: number,
  height: number,

  showTitle: boolean,
  isDashboard: boolean,
  isEditing: boolean,
  isSettings: boolean,
  actionButtons: Node,

  onRender: (data: {
    yAxisSplit?: number[][],
    warnings?: string[],
  }) => void,
  onRenderError: (error?: Error | null) => void,

  hovered?: HoverObject | null,
  onHoverChange: (data?: HoverObject) => void,
  onVisualizationClick: (data?: ClickObject) => void,
  visualizationIsClickable: (data?: ClickObject) => boolean,
  onChangeCardAndRun: OnChangeCardAndRun,

  onUpdateVisualizationSettings: (data: { [key: string]: any }) => void,

  onAddSeries?: Function,
  onEditSeries?: Function,
  onRemoveSeries?: Function,

  onUpdateWarnings?: Function,
};
