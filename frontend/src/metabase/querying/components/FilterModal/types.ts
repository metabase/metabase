import type * as Lib from "metabase-lib";
import type { IconName } from "metabase/core/components/Icon";

export interface ColumnItem {
  column: Lib.ColumnMetadata;
  displayName: string;
  stageIndex: number;
}

export interface GroupItem {
  key: string;
  displayName: string;
  icon: IconName;
  columnItems: ColumnItem[];
}

export interface FilterEditorProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.FilterClause | undefined;
  isSearching: boolean;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
}
