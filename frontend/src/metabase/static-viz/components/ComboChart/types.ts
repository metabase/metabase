export type ColumnValue = number | string | null | undefined;

export type ColumnId = number | string;

export type Column = {
  id: ColumnId;
  name: string;
};

export type Datum = ColumnValue[];

export type Data = Datum[];

export type AxisType = "timeseries" | "linear" | "ordinal" | "pow";

export type VisualizationType = "line" | "area" | "bar";

export type QuestionType = VisualizationType | "combo";

export type SeriesSettings = {
  type: VisualizationType;
  color: string;
  formatting: DateFormatSettings | NumberFormatSettings;
};

export interface DateFormatSettings {
  date_style: string;
}

export interface NumberFormatSettings {
  number_style: string;
  decimals: number;
  currency?: string;
  currency_style?: string;
}

type GoalSettings = {
  showGoal: boolean;
  goal: number;
};

type AxisSettings = {
  type: AxisType;
  title: string;
};

type AxesSettings = {
  x: AxisSettings;
  y: AxisSettings;
};

export type VisualizationSettings = {
  dimensions: ColumnId[];
  metrics: ColumnId[];
  goal?: GoalSettings;
  axes: AxesSettings;
  seriesSettings: Record<string, SeriesSettings>;
};

export type QuestionDataset = {
  name: string;
  type: QuestionType;
  dataset: Data;
  columns: Column[];
  settings: VisualizationSettings;
};

export type Accessor = (datum: Datum) => ColumnValue;
