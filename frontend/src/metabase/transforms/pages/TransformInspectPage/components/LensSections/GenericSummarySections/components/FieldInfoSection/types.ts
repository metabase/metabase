import type {
  TransformInspectField,
  TransformInspectFieldStats,
  TransformInspectSource,
  TransformInspectTarget,
} from "metabase-types/api";

export type FieldInfoSectionProps = {
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
};

export type FieldTreeNode = {
  id: string;
  type: "table" | "field";
  tableName: string;
  fieldName?: string;
  fieldCount?: number;
  baseType?: string;
  stats?: TransformInspectFieldStats;
  children?: FieldTreeNode[];
};

export type TableWithFields = {
  table_id?: number | null;
  table_name: string;
  fields: TransformInspectField[];
};

export type StatsColumn =
  | "distinct_count"
  | "nil_percent"
  | "avg"
  | "min_max"
  | "q1_q3"
  | "earliest_latest";
