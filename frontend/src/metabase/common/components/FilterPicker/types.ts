import type { ColumnMetadata, FilterClause, Query } from "metabase-lib/types";

export interface FilterPickerWidgetProps {
  query: Query;
  stageIndex: number;
  column: ColumnMetadata;
  filter?: FilterClause;
  onChange: (filter: FilterClause) => void;
  onBack: () => void;
}
