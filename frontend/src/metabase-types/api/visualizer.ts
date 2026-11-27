import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

export type VisualizerDataSourceType = "card";
export type VisualizerDataSourceId = `${VisualizerDataSourceType}:${number}`;

export type VisualizerDataSource = {
  id: VisualizerDataSourceId;
  sourceId: number;
  type: VisualizerDataSourceType;
  name: string;
};

export type VisualizerColumnReference = {
  sourceId: VisualizerDataSourceId;
  name: string; // in combined dataset
  originalName: string; // in original dataset
};
// a way to use dataset's name as a value

export type VisualizerDataSourceNameReference =
  `$_${VisualizerDataSourceId}_name`;

export type VisualizerColumnValueSource =
  | VisualizerColumnReference
  | VisualizerDataSourceNameReference;

export type VisualizerVizDefinition = {
  display: VisualizationDisplay | null;
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;
  settings: VisualizationSettings;
  /**
   * The column that replaces the group-by of a question, so that the question
   * follows the shared x-axis. The question itself does not change: the
   * override is applied when the dashcard query runs.
   */
  dimensionOverrides?: Partial<
    Record<VisualizerDataSourceId, VisualizerDimensionOverride>
  >;
};

export type VisualizerDimensionOverride = {
  fieldId: number;
  sourceFieldId?: number | null;
  temporalUnit?: string | null;
};

/**
 * The shared x-axis of a visualization: a dimension category, like `"time"`,
 * `"geo:country"` or `"name:channel"`. Each question uses its own column of
 * that category.
 */
export type VisualizerDimensionAxis = {
  key: string;
  temporalUnit?: string | null;
  // The column of the main question. Other questions prefer it.
  fieldId?: number | null;
  sourceFieldId?: number | null;
  displayName?: string;
};

export type VisualizerDimensionKind =
  | "time"
  | "geo"
  | "category"
  | "boolean"
  | "numeric";

export type VisualizerDimensionOption = {
  fieldId: number;
  sourceFieldId: number | null;
  name: string;
  displayName: string;
  temporal: boolean;
  kind: VisualizerDimensionKind;
  categoryKey: string;
  categoryName: string;
  temporalUnit?: string | null;
};

export type VisualizerAxisMatch =
  | { status: "match" }
  | {
      status: "regroup";
      override: VisualizerDimensionOverride;
      column: VisualizerDimensionOption;
    }
  | { status: "incompatible"; reason: string };

export type CardDimensionOptions =
  | { supported: false; reason: string }
  | {
      supported: true;
      current: VisualizerDimensionOption | null;
      axis?: VisualizerAxisMatch;
      columns?: VisualizerDimensionOption[];
    };

export type CardDimensionOptionsRequest = {
  card_ids: number[];
  axis?: VisualizerDimensionAxis;
  preferred?: { cardId: number; override: VisualizerDimensionOverride }[];
  include_columns?: boolean;
};
