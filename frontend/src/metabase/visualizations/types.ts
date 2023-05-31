import {
  Card,
  DatasetColumn,
  DatasetData,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import type { ClickObject } from "metabase/modes/types";

type OnChangeCardAndRunOpts = {
  previousCard?: Card;
  nextCard: Card;
};

export type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;

type HoverData = Array<{ key: string; value: any; col?: DatasetColumn }>;

type HoverObject = {
  index?: number;
  axisIndex?: number;
  data?: HoverData;
  element?: HTMLElement;
  event?: MouseEvent;
};

export interface VisualizationProps {
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
  getExtraDataForClick?: (clickObject?: ClickObject) => Record<string, unknown>;
  onChangeCardAndRun: OnChangeCardAndRun;

  onUpdateVisualizationSettings: (settings: Record<string, any>) => void;

  onAddSeries?: any;
  onEditSeries?: any;
  onRemoveSeries?: any;

  onUpdateWarnings?: any;
}
