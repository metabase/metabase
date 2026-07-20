import type { ColorPalette } from "metabase/ui/colors/types";
import type {
  ColumnFormattingSetting,
  DashCardVisualizationSettings,
  DatasetColumn,
  DayOfWeekId,
  FormattingSettings,
  RawSeries,
  RowValue,
  RowValues,
  TokenFeatures,
  VisualizerVizDefinition,
} from "metabase-types/api";

export type RenderChartOptions = {
  tokenFeatures: TokenFeatures;
  applicationColors: ColorPalette;
  customFormatting: FormattingSettings;
  startOfWeek: DayOfWeekId | null | undefined;
  locale?: string | null;
  // Explicit pixel dimensions for the chart. Use fitWithinBounds to have height include
  // chart legends
  width?: number;
  height?: number;
  // When true, width/height are treated as the exact output box
  fitWithinBounds?: boolean;
};

export type RenderChartDashcardSettings = DashCardVisualizationSettings & {
  visualization?: VisualizerVizDefinition;
};

// The default (isomorphic) path — anything StaticVisualization can render.
export type IsomorphicChartInput = {
  kind?: undefined;
  rawSeries: RawSeries;
  dashcardSettings: RenderChartDashcardSettings;
  options: RenderChartOptions;
};

// Legacy funnel/gauge charts render through LegacyStaticChart, whose options are untyped.
export type FunnelChartInput = {
  kind: "funnel";
  data: unknown;
  settings: unknown;
  tokenFeatures: TokenFeatures;
};

export type GaugeChartInput = {
  kind: "gauge";
  card: unknown;
  data: unknown;
  tokenFeatures: TokenFeatures;
};

export type RenderChartInput =
  | IsomorphicChartInput
  | FunnelChartInput
  | GaugeChartInput;

export type RenderedChart = {
  type: "svg" | "html";
  content: string;
};

// One cell to color: its value, its row index, and its column name.
export type CellToColor = [
  value: RowValue,
  rowIndex: number,
  columnName: string,
];

export type CellBackgroundColorsInput = {
  rows: RowValues[];
  cols: DatasetColumn[];
  settings: {
    "table.column_formatting"?: ColumnFormattingSetting[];
    "table.pivot"?: boolean;
  };
  cells: CellToColor[];
};
