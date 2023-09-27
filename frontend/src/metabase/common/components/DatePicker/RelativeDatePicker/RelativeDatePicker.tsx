import type * as Lib from "metabase-lib";

export interface RelativeDatePickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (clause: Lib.ExpressionClause) => void;
  onBack: () => void;
}

export const RelativeDatePicker = ({
  query,
  stageIndex,
  column,
  filter,
  onChange,
  onBack,
}: RelativeDatePickerProps) => {
  return <div />;
};
