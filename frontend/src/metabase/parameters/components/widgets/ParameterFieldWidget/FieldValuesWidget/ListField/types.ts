import type { JSX } from "react";

import type { RowValue } from "metabase-types/api";
export type Option = any[];

export interface ListFieldProps {
  onChange: (value: RowValue[]) => void;
  value: RowValue[];
  options: Option;
  optionRenderer: (option: any) => JSX.Element;
  placeholder: string;
  isDashboardFilter?: boolean;
  checkedColor?: string;
  isLoading?: boolean;
}
