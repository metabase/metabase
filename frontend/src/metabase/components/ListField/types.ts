import type { RowValue } from "metabase-types/api";
export type Option = any[];

export interface ListFieldProps {
  onChange: (value: string[]) => void;
  value: RowValue[];
  options: Option;
  optionRenderer: (option: any) => JSX.Element;
  placeholder: string;
  isDashboardFilter?: boolean;
  checkedColor?: string;
}
