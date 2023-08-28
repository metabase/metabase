import type {
  Card,
  DatasetData,
  RawSeries,
  Series,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";
import type { ClickObject } from "metabase/visualizations/types";
import type { IconName, IconProps } from "metabase/core/components/Icon";
import type Query from "metabase-lib/queries/Query";

import type { HoveredObject } from "./hover";
import type { RemappingHydratedDatasetColumn } from "./columns";

type OnChangeCardAndRunOpts = {
  previousCard?: Card;
  nextCard: Card;
  seriesIndex?: number;
};

export type OnChangeCardAndRun = (opts: OnChangeCardAndRunOpts) => void;

export type ComputedVisualizationSettings = VisualizationSettings & {
  column?: (
    col: RemappingHydratedDatasetColumn,
  ) => RemappingHydratedDatasetColumn;
};

export interface VisualizationProps {
  series: Series;
  card: Card;
  data: DatasetData;
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  headerIcon: IconProps;
  actionButtons: React.ReactNode;
  fontFamily: string;
  isPlaceholder?: boolean;
  isFullscreen: boolean;
  isQueryBuilder: boolean;
  showTitle: boolean;
  isDashboard: boolean;
  isEditing: boolean;
  isSettings: boolean;
  hovered?: HoveredObject;
  className?: string;

  gridSize?: VisualizationGridSize;
  width: number;
  height: number;

  visualizationIsClickable: (clickObject?: ClickObject) => boolean;
  getExtraDataForClick?: (clickObject?: ClickObject) => Record<string, unknown>;

  onRender: ({
    yAxisSplit,
    warnings,
  }: {
    yAxisSplit?: number[][];
    warnings?: string[];
  }) => void;
  onRenderError: (error?: Error) => void;
  onChangeCardAndRun: OnChangeCardAndRun;
  onHoverChange: (hoverObject?: HoveredObject | null) => void;
  onVisualizationClick: (clickObject?: ClickObject) => void;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;

  "graph.dimensions"?: string[];
  "graph.metrics"?: string[];

  onAddSeries?: any;
  onEditSeries?: any;
  onRemoveSeries?: any;
  onUpdateWarnings?: any;
}

export type VisualizationSettingDefinition<TValue, TProps = void> = {
  section?: string;
  title?: string;
  group?: string;
  widget?: string | React.ComponentType<TProps>;
  isValid?: (series: Series, settings: VisualizationSettings) => boolean;
  getHidden?: (series: Series, settings: VisualizationSettings) => boolean;
  getDefault?: (series: Series, settings: VisualizationSettings) => TValue;
  getValue?: (series: Series, settings: VisualizationSettings) => TValue;
  default?: TValue;
  marginBottom?: string;
  getMarginBottom?: (series: Series, settings: VisualizationSettings) => string;
  persistDefault?: boolean;
  props?: TProps;
  getProps?: (
    series: Series,
    vizSettings: VisualizationSettings,
    onChange: (value: TValue) => void,
    extra: unknown,
  ) => TProps;
  readDependencies?: string[];
  writeDependencies?: string[];
  eraseDependencies?: string[];
  // is the setting visible in the dashboard card viz settings
  dashboard?: boolean;
  useRawSeries?: boolean;
};

export type VisualizationSettingsDefinitions = {
  [key: string]: VisualizationSettingDefinition<unknown, unknown>;
};

export type VisualizationGridSize = {
  // grid columns
  width: number;
  // grid rows
  height: number;
};

// TODO: add component property for the react component instead of the intersection
export type Visualization = React.ComponentType<VisualizationProps> & {
  name: string;
  noun: string;
  uiName: string;
  identifier: string;
  aliases?: string[];
  iconName: IconName;

  maxMetricsSupported: number;
  maxDimensionsSupported: number;

  disableClickBehavior?: boolean;
  canSavePng?: boolean;
  noHeader: boolean;
  hidden?: boolean;
  disableSettingsConfig?: boolean;
  supportPreviewing?: boolean;
  supportsSeries?: boolean;

  minSize: VisualizationGridSize;
  defaultSize: VisualizationGridSize;

  settings: VisualizationSettingsDefinitions;

  placeHolderSeries: Series;

  transformSeries: (series: Series) => TransformedSeries;
  // TODO: remove dependency on metabase-lib
  isSensible: (data: DatasetData, query?: Query) => boolean;
  // checkRenderable throws an error if a visualization is not renderable
  checkRenderable: (
    series: Series,
    settings: VisualizationSettings,
    query: Query,
  ) => void | never;
  isLiveResizable: (series: Series) => boolean;
  onDisplayUpdate?: (settings: VisualizationSettings) => VisualizationSettings;
};
