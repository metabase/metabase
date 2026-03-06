import type {
  ConcreteTableId,
  InspectorField,
  InspectorFieldStats,
  InspectorSource,
  InspectorTarget,
} from "metabase-types/api";

export type FieldInfoSectionProps = {
  sources: InspectorSource[];
  target?: InspectorTarget;
};

export type FieldTreeNode = {
  id: string;
  type: "table" | "field";
  tableName: string;
  fieldName?: string;
  fieldCount?: number;
  baseType?: string;
  stats?: InspectorFieldStats;
  original?: InspectorField;
  children?: FieldTreeNode[];
};

export type TableWithFields = {
  table_id?: ConcreteTableId | null;
  table_name: string;
  fields: InspectorField[];
};

export type StatsColumn = "distinct_count" | "range_and_averages";
