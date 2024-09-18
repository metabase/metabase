type DisplayType = "pie" | "table" | "bar" | "line" | "row" | "area" | "scalar";

type FilterOperator = "=" | "<" | ">";

interface Filter {
  comparator: FilterOperator;
  fieldName: string;
  value: string;
}

type SummarizationMetric = "sum" | "count" | "average";

interface Summarization {
  fieldName: string;
  metrics: SummarizationMetric;
}

type Granularity = "day" | "week" | "month" | "year";

interface Group {
  fieldName: string;
  granularity?: Granularity;
}

export interface ApplyVisualizationToolCall {
  display?: DisplayType;
  filters?: Filter[];
  summarizations?: Summarization[];
  groups?: Group[];
}
