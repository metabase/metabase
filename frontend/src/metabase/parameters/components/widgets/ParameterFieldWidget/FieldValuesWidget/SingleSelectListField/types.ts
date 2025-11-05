import type { FieldValue, RowValue } from "metabase-types/api";

export type Option = FieldValue;

export interface SingleSelectListFieldProps {
  onChange: (value: RowValue[]) => void;
  value: RowValue[];
  options: Option[];
  optionRenderer: (option: Option) => JSX.Element;
  onSearchChange?: (value: string) => void;
  placeholder: string;
  isDashboardFilter?: boolean;
  isLoading?: boolean;
  checkedColor?: string;
}
