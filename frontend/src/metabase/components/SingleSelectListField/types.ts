import type { RowValue } from "metabase-types/api";

export type Option = any[];

export interface SingleSelectListFieldProps {
  onChange: (value: RowValue[]) => void;
  value: RowValue[];
  options: Option;
  optionRenderer: (option: any) => JSX.Element;
  onSearchChange: (value: string) => void;
  placeholder: string;
  isDashboardFilter?: boolean;
  isLoading?: boolean;
  checkedColor?: string;
  alwaysShowOptions?: boolean;
}
